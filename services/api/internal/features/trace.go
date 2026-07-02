package features

import (
    "context"
    "encoding/json"

    "database/sql"

    "errors"
    "fmt"
    "net/http"
    "strconv"
    "strings"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

// ─────────────────────────────────────────────────────────────
// Eligible layers for feeder tracing
// ─────────────────────────────────────────────────────────────

var traceableTables = map[string]bool{
    "dbo_oh_conductor_11kv_evw":  true,
    "dbo_oh_conductor_33kv_evw":  true,
    "dbo_oh_conductor_lvle_evw":  true,
    "dbo_ug_cable_11kv_evw":      true,
    "dbo_ug_cable_33kv_evw":      true,
    "dbo_ug_cable_lvle_evw":      true,
    "dbo_service_line_lvle_evw":  true,
}

// Companion tables at the same voltage. When "include_companion" is set,
// the trace also aggregates matching features from these tables.
var traceCompanions = map[string][]string{
    "dbo_oh_conductor_11kv_evw": {"dbo_ug_cable_11kv_evw"},
    "dbo_oh_conductor_33kv_evw": {"dbo_ug_cable_33kv_evw"},
    "dbo_ug_cable_11kv_evw":     {"dbo_oh_conductor_11kv_evw"},
    "dbo_ug_cable_33kv_evw":     {"dbo_oh_conductor_33kv_evw"},
}

// Human-readable display for a table name in the trace breakdown.
var tableDisplayNames = map[string]string{
    "dbo_oh_conductor_11kv_evw": "OH Conductor 11kV",
    "dbo_oh_conductor_33kv_evw": "OH Conductor 33kV",
    "dbo_ug_cable_11kv_evw":     "UG Cable 11kV",
    "dbo_ug_cable_33kv_evw":     "UG Cable 33kV",
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TraceOptions struct {
    IncludeCompanion    bool `json:"include_companion,omitempty"`
    IncludeTransformers bool `json:"include_transformers,omitempty"`
}

// FeederSegment — one voltage-class-and-medium contribution to the trace.
type FeederSegment struct {
    LayerName    string          `json:"layer_name"`     // human name
    TableName    string          `json:"table_name"`     // internal
    LengthM      float64         `json:"length_m"`
    SegmentCount int64           `json:"segment_count"`
    Geometry     json.RawMessage `json:"geometry"`
}

type TraceResult struct {
    FeederKey string     `json:"feeder_key"`
    KeySource string     `json:"key_source"`
    Bounds    [4]float64 `json:"bounds"`

    // Primary — the table the user clicked (always present)
    Primary FeederSegment `json:"primary"`

    // Companions — same voltage, other medium (optional)
    Companions []FeederSegment `json:"companions,omitempty"`

    // Total — sum across primary + companions
    TotalLength  float64 `json:"total_length_m"`
    SegmentCount int64   `json:"segment_count"`

    // Distribution transformers (optional)
    TransformerCount int64           `json:"transformer_count,omitempty"`
    Transformers     json.RawMessage `json:"transformers,omitempty"`
}

// ─────────────────────────────────────────────────────────────
// Service method
// ─────────────────────────────────────────────────────────────

func (s *Service) TraceFeeder(
    ctx context.Context,
    layerID uuid.UUID,
    ogcFid int64,
    opts TraceOptions,
) (*TraceResult, error) {
    l, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return nil, err
    }
    if !traceableTables[t.Table] {
        return nil, fmt.Errorf("layer %q is not traceable", l.Name)
    }
    return s.repo.TraceFeeder(ctx, t, ogcFid, opts)
}

// ─────────────────────────────────────────────────────────────
// Repo method
// ─────────────────────────────────────────────────────────────
//

// TraceFeeder — orchestrates the whole trace, respecting options.
func (r *Repo) TraceFeeder(
    ctx context.Context,
    t TableSpec,
    ogcFid int64,
    opts TraceOptions,
) (*TraceResult, error) {
    // Resolve the feeder key using the CLICKED feature
    origKey, keySource, err := r.resolveFeederKey(ctx, t, ogcFid)
    if err != nil {
        return nil, err
    }

    // Fetch primary segment (the layer the user clicked)
    primary, err := r.aggregateSegmentForFeeder(ctx, t.Table, t.Qualified(), origKey)
    if err != nil {
        return nil, err
    }

    result := &TraceResult{
        FeederKey: origKey,
        KeySource: keySource,
        Primary:   primary,
    }

    // Add companion tables if requested
    if opts.IncludeCompanion {
        for _, companionTable := range traceCompanions[t.Table] {
            qualified := fmt.Sprintf(`"dbo".%q`, companionTable)
            seg, err := r.aggregateSegmentForFeeder(ctx, companionTable, qualified, origKey)
            if err != nil {
                continue // non-fatal
            }
            if seg.SegmentCount > 0 {
                result.Companions = append(result.Companions, seg)
            }
        }
    }

    // Compute totals + overall bounds from primary + companions
    result.TotalLength = primary.LengthM
    result.SegmentCount = primary.SegmentCount
    for _, c := range result.Companions {
        result.TotalLength += c.LengthM
        result.SegmentCount += c.SegmentCount
    }

    // Bounds from union of all geometries
    result.Bounds = r.combinedBoundsForFeeder(ctx, t.Table, origKey, opts.IncludeCompanion)

    // Attach transformers if requested
    if opts.IncludeTransformers {
        if err := r.attachTransformers(ctx, result, origKey); err != nil {
            result.TransformerCount = 0
            result.Transformers = nil
        }
    }

    return result, nil
}

// resolveFeederKey returns the ACTUAL feeder key (case preserved) plus source.
func (r *Repo) resolveFeederKey(ctx context.Context, t TableSpec, ogcFid int64) (string, string, error) {
    q := fmt.Sprintf(`
        SELECT
          COALESCE(NULLIF(TRIM(circuit_id), ''), NULLIF(TRIM(other_circuit_id), '')) AS raw_key,
          CASE
            WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL THEN 'other_circuit_id'
            ELSE 'circuit_id'
          END AS key_source
        FROM %s
        WHERE %s = ?
        LIMIT 1`,
        t.Qualified(), t.IDCol(),
    )
    var rawKey sql.NullString
    var keySource string
    if err := r.db.QueryRowContext(ctx, q, ogcFid).Scan(&rawKey, &keySource); err != nil {
        return "", "", fmt.Errorf("resolve feeder key: %w", err)
    }
    if !rawKey.Valid || rawKey.String == "" {
        return "", "", errors.New("no feeder key on this feature")
    }

    trimmed := strings.TrimSpace(rawKey.String)
    // If the primary was "Other" (case-insensitive), use the fallback
    if strings.EqualFold(trimmed, "other") {
        q2 := fmt.Sprintf(`SELECT TRIM(other_circuit_id) FROM %s WHERE %s = ?`, t.Qualified(), t.IDCol())
        var s2 sql.NullString
        if err := r.db.QueryRowContext(ctx, q2, ogcFid).Scan(&s2); err != nil {
            return "", "", err
        }
        if !s2.Valid || strings.TrimSpace(s2.String) == "" {
            return "", "", errors.New("no fallback feeder key")
        }
        return strings.TrimSpace(s2.String), "other_circuit_id", nil
    }
    return trimmed, keySource, nil
}

// aggregateSegmentForFeeder queries ONE table for matching rows.
func (r *Repo) aggregateSegmentForFeeder(
    ctx context.Context,
    tableName string,
    qualified string,
    feederKey string,
) (FeederSegment, error) {
    q := fmt.Sprintf(`
        WITH matching AS (
          SELECT the_geom
          FROM   %s
          WHERE  CASE
                   WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL
                     THEN TRIM(other_circuit_id) = ?
                   ELSE lower(TRIM(circuit_id)) = ?
                 END
        )
        SELECT
          COALESCE(SUM(ST_Length(the_geom::geography)), 0)                        AS length_m,
          COUNT(*)                                                                AS segment_count,
          COALESCE(
            ST_AsGeoJSON(ST_Multi(ST_Collect(the_geom)), 6, 0),
            '{"type":"MultiLineString","coordinates":[]}'
          )                                                                        AS geojson
        FROM matching`,
        qualified,
    )

    var lengthM float64
    var count int64
    var geomStr string
    err := r.db.QueryRowContext(ctx, q, feederKey, strings.ToLower(strings.TrimSpace(feederKey))).
        Scan(&lengthM, &count, &geomStr)
    if err != nil {
        return FeederSegment{}, fmt.Errorf("aggregate segment for %s: %w", tableName, err)
    }

    displayName := tableDisplayNames[tableName]
    if displayName == "" {
        displayName = tableName
    }

    return FeederSegment{
        LayerName:    displayName,
        TableName:    tableName,
        LengthM:      lengthM,
        SegmentCount: count,
        Geometry:     json.RawMessage(geomStr),
    }, nil
}

// combinedBoundsForFeeder computes bounds across the union of all matching
// geometries (primary + optional companions).
func (r *Repo) combinedBoundsForFeeder(
    ctx context.Context,
    primaryTable string,
    feederKey string,
    includeCompanion bool,
) [4]float64 {
    // Build a UNION of primary + companions
    tables := []string{fmt.Sprintf(`"dbo".%q`, primaryTable)}
    if includeCompanion {
        for _, c := range traceCompanions[primaryTable] {
            tables = append(tables, fmt.Sprintf(`"dbo".%q`, c))
        }
    }

    unionParts := make([]string, 0, len(tables))
    for _, table := range tables {
        unionParts = append(unionParts, fmt.Sprintf(`
          SELECT the_geom FROM %s
          WHERE CASE
                  WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL
                    THEN TRIM(other_circuit_id) = ?
                  ELSE lower(TRIM(circuit_id)) = ?
                END`, table))
    }

    q := fmt.Sprintf(`
        WITH matching AS (%s)
        SELECT
          COALESCE(ST_XMin(ST_Extent(the_geom)), 0),
          COALESCE(ST_YMin(ST_Extent(the_geom)), 0),
          COALESCE(ST_XMax(ST_Extent(the_geom)), 0),
          COALESCE(ST_YMax(ST_Extent(the_geom)), 0)
        FROM matching`,
        strings.Join(unionParts, " UNION ALL "),
    )

    args := make([]any, 0, len(tables)*2)
    for i := 0; i < len(tables); i++ {
        args = append(args, feederKey, strings.ToLower(strings.TrimSpace(feederKey)))
    }

    var xmin, ymin, xmax, ymax float64
    if err := r.db.QueryRowContext(ctx, q, args...).Scan(&xmin, &ymin, &xmax, &ymax); err != nil {
        return [4]float64{0, 0, 0, 0}
    }
    return [4]float64{xmin, ymin, xmax, ymax}
}

// attachTransformers queries DSS transformers matching this feeder key.
func (r *Repo) attachTransformers(ctx context.Context, result *TraceResult, feederKey string) error {
    const table = `"dbo"."dbo_distribution_transformer_dss_evw"`

    q := fmt.Sprintf(`
        WITH matching AS (
          SELECT the_geom
          FROM   %s
          WHERE  CASE
                   WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL
                     THEN TRIM(other_circuit_id) = ?
                   ELSE lower(TRIM(circuit_id)) = ?
                 END
        )
        SELECT
          COUNT(*),
          COALESCE(
            ST_AsGeoJSON(ST_Multi(ST_Collect(the_geom)), 6, 0),
            '{"type":"MultiPoint","coordinates":[]}'
          )
        FROM matching`,
        table,
    )

    var count int64
    var geomStr string
    if err := r.db.QueryRowContext(ctx, q, feederKey, strings.ToLower(strings.TrimSpace(feederKey))).
        Scan(&count, &geomStr); err != nil {
        return err
    }

    result.TransformerCount = count
    if count > 0 {
        result.Transformers = json.RawMessage(geomStr)
    }
    return nil
}

func (r *Repo) TraceFeederByOgcFid(ctx context.Context, t TableSpec, ogcFid int64) (*TraceResult, error) {
    // Step 1: get this feature's feeder key
    // Rule: coalesce(NULLIF(circuit_id, 'other'), NULLIF(other_circuit_id, ''), NULL)
    // Case-insensitive comparison to 'other' so "Other", "OTHER" also match.
    keyQ := fmt.Sprintf(`
        SELECT
          COALESCE(
            NULLIF(lower(TRIM(circuit_id)), 'other'),
            NULLIF(TRIM(other_circuit_id), '')
          )   AS feeder_key,
          CASE
            WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL THEN 'other_circuit_id'
            ELSE 'circuit_id'
          END AS key_source
        FROM %s
        WHERE %s = ?
        LIMIT 1`,
        t.Qualified(), t.IDCol(),
    )

    var feederKey sql.NullString
    var keySource string
    if err := r.db.QueryRowContext(ctx, keyQ, ogcFid).Scan(&feederKey, &keySource); err != nil {
        return nil, fmt.Errorf("resolve feeder key: %w", err)
    }
    if !feederKey.Valid || feederKey.String == "" {
        return nil, errors.New("no feeder key on this feature")
    }

    // Step 2: sum length + count + union geometry + compute bounds
    // Uses geography for accurate metres. Union → MultiLineString.
    var (
        lengthM      float64
        segments     int64
        geomStr      string      // ← was json.RawMessage
        xmin, ymin, xmax, ymax float64
    )

    traceQ := fmt.Sprintf(`
        WITH matching AS (
          SELECT the_geom
          FROM   %s
          WHERE  CASE
                   WHEN lower(TRIM(circuit_id)) = 'other' OR circuit_id IS NULL
                     THEN TRIM(other_circuit_id) = ?
                   ELSE lower(TRIM(circuit_id)) = ?
                 END
        )
        SELECT
          COALESCE(SUM(ST_Length(the_geom::geography)), 0)     AS total_length_m,
          COUNT(*)                                             AS segment_count,
          ST_AsGeoJSON(ST_Multi(ST_Collect(the_geom)), 6, 0)   AS geojson,
          ST_XMin(ST_Extent(the_geom))                          AS xmin,
          ST_YMin(ST_Extent(the_geom))                          AS ymin,
          ST_XMax(ST_Extent(the_geom))                          AS xmax,
          ST_YMax(ST_Extent(the_geom))                          AS ymax
        FROM matching`,
        t.Qualified(),
    )

    // The feederKey is matched two ways in the CASE; pass it twice.
    // We compare to the ORIGINAL (not lowercased) for other_circuit_id
    // but LOWER for circuit_id. Since we lowered it during Step 1,
    // we need the original. Re-fetch — cheap.
    origKey, err := r.rawKeyForRow(ctx, t, ogcFid)
    if err != nil {
        return nil, err
    }

    row := r.db.QueryRowContext(ctx, traceQ, origKey, strings.ToLower(strings.TrimSpace(origKey)))
    if err := row.Scan(&lengthM, &segments, &geomStr, &xmin, &ymin, &xmax, &ymax); err != nil {
        return nil, fmt.Errorf("aggregate trace: %w", err)
    }

    return &TraceResult{
        FeederKey:    origKey,
        KeySource:    keySource,
        TotalLength:  lengthM,
        SegmentCount: segments,
        Bounds:       [4]float64{xmin, ymin, xmax, ymax},
    }, nil
}

// rawKeyForRow gets the ACTUAL feeder key value (preserving case)
// so the trace query matches other_circuit_id exactly.
func (r *Repo) rawKeyForRow(ctx context.Context, t TableSpec, ogcFid int64) (string, error) {
    q := fmt.Sprintf(`
        SELECT COALESCE(
          NULLIF(TRIM(circuit_id), ''),
          NULLIF(TRIM(other_circuit_id), '')
        )
        FROM %s WHERE %s = ?
        LIMIT 1`,
        t.Qualified(), t.IDCol(),
    )
    var s sql.NullString
    if err := r.db.QueryRowContext(ctx, q, ogcFid).Scan(&s); err != nil {
        return "", err
    }
    if !s.Valid {
        return "", errors.New("no feeder key")
    }
    // If the primary was 'other' (case-insensitive), use the fallback
    trimmed := strings.TrimSpace(s.String)
    if strings.EqualFold(trimmed, "other") {
        q2 := fmt.Sprintf(`SELECT TRIM(other_circuit_id) FROM %s WHERE %s = ?`, t.Qualified(), t.IDCol())
        var s2 sql.NullString
        if err := r.db.QueryRowContext(ctx, q2, ogcFid).Scan(&s2); err != nil {
            return "", err
        }
        if !s2.Valid || strings.TrimSpace(s2.String) == "" {
            return "", errors.New("no fallback feeder key")
        }
        return strings.TrimSpace(s2.String), nil
    }
    return trimmed, nil
}


// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

type traceRequest struct {
    IncludeCompanion    bool `json:"include_companion,omitempty"`
    IncludeTransformers bool `json:"include_transformers,omitempty"`
}

func (h *Handler) TraceFeeder(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    ogcFidStr := chi.URLParam(r, "ogcFid")
    ogcFid, err := strconv.ParseInt(ogcFidStr, 10, 64)
    if err != nil {
        httpx.BadRequest(w, "invalid ogcFid")
        return
    }
    var req traceRequest
    _ = httpx.DecodeJSON(r, &req)

    res, err := h.svc.TraceFeeder(r.Context(), layerID, ogcFid, TraceOptions{
        IncludeCompanion:    req.IncludeCompanion,
        IncludeTransformers: req.IncludeTransformers,
    })
    if err != nil {
        if strings.Contains(err.Error(), "not traceable") {
            httpx.BadRequest(w, err.Error())
            return
        }
        if strings.Contains(err.Error(), "no feeder key") {
            httpx.NotFound(w, "no feeder key on this feature")
            return
        }
        httpx.Internal(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, res)
}
