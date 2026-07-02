package features

import (
    "context"
    "database/sql"
    "encoding/csv"
    "encoding/json"
    "errors"
    "io"
    "sort"
    "strconv"

    "github.com/google/uuid"

    "github.com/kwaabs/ntaa/services/api/internal/layers"
)


// ─────────────────────────────────────────────────────────────
// Sentinel errors
// ─────────────────────────────────────────────────────────────

var (
    ErrLayerNotFound   = errors.New("layer not found")
    ErrLayerReadOnly   = errors.New("layer is read-only")
    ErrFeatureNotFound = errors.New("feature not found")
    ErrInvalidInput    = errors.New("invalid input")
)

// ─────────────────────────────────────────────────────────────
// Types (public API of the service)
// ─────────────────────────────────────────────────────────────

// SortField is used by both the handler and repo to describe sorting.
type SortField struct {
    Column    string `json:"column"`
    Direction string `json:"direction"` // "asc" | "desc"
}

// QueryParams is the input to the paginated query.
type QueryParams struct {
    Geometry     json.RawMessage

    Filters      *Filter        // ← NEW

    Sort         []SortField
    Cursor       string
    Limit        int
    IncludeCount bool
}

// QueryResult is the output of the paginated query.
type QueryResult struct {
    Features   []Feature
    TotalCount *int64
    Estimated  bool
    NextCursor string
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

type Service struct {
    layersSvc *layers.Service
    repo      *Repo
}

func NewService(layersSvc *layers.Service, repo *Repo) *Service {
    return &Service{layersSvc: layersSvc, repo: repo}
}

// resolve loads the layer + builds its physical TableSpec.
func (s *Service) resolve(ctx context.Context, layerID uuid.UUID) (*layers.Layer, TableSpec, error) {
    l, err := s.layersSvc.Get(ctx, layerID)
    if err != nil {
        if errors.Is(err, layers.ErrNotFound) {
            return nil, TableSpec{}, ErrLayerNotFound
        }
        return nil, TableSpec{}, err
    }
    return l, TableSpec{
        Schema:     l.SchemaName,
        Table:      l.TableName,
        IDColumn:   l.IDColumn,
        GeomColumn: l.GeometryColumn,
        SRID:       l.SRID,
    }, nil
}

// ─── READ ──────────────────────────────────────────────

func (s *Service) Count(ctx context.Context, layerID uuid.UUID) (int64, error) {
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return 0, err
    }
    return s.repo.Count(ctx, t)
}

func (s *Service) Get(ctx context.Context, layerID uuid.UUID, ogcFid int64) (Feature, error) {
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return Feature{}, err
    }
    geom, props, err := s.repo.GetByID(ctx, t, ogcFid)
    if err != nil {
        return Feature{}, err
    }
    if geom == nil && props == nil {
        return Feature{}, ErrFeatureNotFound
    }
    return NewFeature(ogcFid, geom, props), nil
}

func (s *Service) List(ctx context.Context, layerID uuid.UUID, bbox *[4]float64, limit int) (FeatureCollection, error) {
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return FeatureCollection{}, err
    }
    feats, err := s.repo.ListByBBox(ctx, t, bbox, limit)
    if err != nil {
        return FeatureCollection{}, err
    }
    return NewFeatureCollection(feats), nil
}

// ─── SPATIAL (highlight path — one-shot fetch) ────────

func (s *Service) CountWithin(ctx context.Context, layerID uuid.UUID, geometry json.RawMessage, filter *Filter) (int64, error) {
    if len(geometry) == 0 {
        return 0, ErrInvalidInput
    }
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return 0, err
    }
    return s.repo.CountByGeometry(ctx, t, geometry, filter)
}


func (s *Service) QueryWithin(ctx context.Context, layerID uuid.UUID, geometry json.RawMessage, filter *Filter, limit int) (FeatureCollection, error) {
    if len(geometry) == 0 {
        return FeatureCollection{}, ErrInvalidInput
    }
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return FeatureCollection{}, err
    }
    feats, err := s.repo.ListByGeometry(ctx, t, geometry, filter, limit)
    if err != nil {
        return FeatureCollection{}, err
    }
    return NewFeatureCollection(feats), nil
}


// ─── PAGINATION (table path) ──────────────────────────

func (s *Service) QueryPaginated(ctx context.Context, layerID uuid.UUID, params QueryParams) (*QueryResult, error) {
    if len(params.Geometry) == 0 {
        return nil, ErrInvalidInput
    }
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return nil, err
    }

    res, err := s.repo.PageByGeometry(ctx, t, PageParams{
        Geometry: params.Geometry,
        Filters:  params.Filters,          // ← pass through
        Sort:     params.Sort,
        Cursor:   params.Cursor,
        Limit:    params.Limit,
    })
    if err != nil {
        return nil, err
    }

    out := &QueryResult{
        Features:   res.Features,
        NextCursor: res.NextCursor,
    }

    // Count only on the first page.
    if params.IncludeCount && params.Cursor == "" {
        count, estimated, err := s.repo.CountForPagination(ctx, t, params.Geometry, params.Filters)
        if err == nil {
            out.TotalCount = &count
            out.Estimated = estimated
        }
    }


    return out, nil
}

// ─── WRITE ─────────────────────────────────────────────

func (s *Service) Create(ctx context.Context, layerID uuid.UUID, geometry, properties json.RawMessage) (Feature, error) {
    l, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return Feature{}, err
    }
    if !l.Editable {
        return Feature{}, ErrLayerReadOnly
    }
    id, geom, props, err := s.repo.Insert(ctx, t, geometry, properties)
    if err != nil {
        return Feature{}, err
    }
    return NewFeature(id, geom, props), nil
}

func (s *Service) Update(ctx context.Context, layerID uuid.UUID, ogcFid int64, geometry, properties json.RawMessage) (Feature, error) {
    l, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return Feature{}, err
    }
    if !l.Editable {
        return Feature{}, ErrLayerReadOnly
    }
    geom, props, err := s.repo.Update(ctx, t, ogcFid, geometry, properties)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return Feature{}, ErrFeatureNotFound
        }
        return Feature{}, err
    }
    return NewFeature(ogcFid, geom, props), nil
}

func (s *Service) Delete(ctx context.Context, layerID uuid.UUID, ogcFid int64) error {
    l, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return err
    }
    if !l.Editable {
        return ErrLayerReadOnly
    }
    if err := s.repo.Delete(ctx, t, ogcFid); err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return ErrFeatureNotFound
        }
        return err
    }
    return nil
}


// ExportCSVParams — inputs for streaming CSV.
type ExportCSVParams struct {
    Geometry json.RawMessage
    Filters  *Filter          // ← NEW
    Sort     []SortField
    Columns  []string // optional; if nil, all columns present in the first row
}

// StreamCSV writes the query result as CSV to w. Streams row-by-row.
// Caller is responsible for setting HTTP headers before calling.

func (s *Service) StreamCSV(
    ctx context.Context,
    layerID uuid.UUID,
    params ExportCSVParams,
    w io.Writer,
) error {
    if len(params.Geometry) == 0 {
        return ErrInvalidInput
    }
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return err
    }


    cw := csv.NewWriter(w)
    defer cw.Flush()

    var headerCols []string
    rowCount := 0

    err = s.repo.StreamByGeometry(ctx, t, params.Geometry,params.Filters, params.Sort,
        func(id int64, propsRaw json.RawMessage) error {
            var props map[string]any
            if err := json.Unmarshal(propsRaw, &props); err != nil {
                return err
            }

            // Choose header columns from the first row (or user-provided list).
            if rowCount == 0 {
                if len(params.Columns) > 0 {
                    headerCols = params.Columns
                } else {
                    headerCols = make([]string, 0, len(props)+1)
                    headerCols = append(headerCols, "ogc_fid")
                    // Deterministic column order: sort keys alphabetically.
                    keys := make([]string, 0, len(props))
                    for k := range props {
                        keys = append(keys, k)
                    }
                    sort.Strings(keys)
                    headerCols = append(headerCols, keys...)
                }
                if err := cw.Write(headerCols); err != nil {
                    return err
                }
            }

            // Build the row in header order.
            row := make([]string, len(headerCols))
            for i, col := range headerCols {
                if col == "ogc_fid" {
                    row[i] = strconv.FormatInt(id, 10)
                    continue
                }
                row[i] = formatCSVValue(props[col])
            }

            if err := cw.Write(row); err != nil {
                return err
            }

            rowCount++
            // Flush periodically so the browser starts receiving data.
            if rowCount%500 == 0 {
                cw.Flush()
            }
            return nil
        })
    if err != nil {
        return err
    }

    return nil
}

// formatCSVValue turns any JSON value into a CSV-safe string.
func formatCSVValue(v any) string {
    if v == nil {
        return ""
    }
    switch x := v.(type) {
    case string:
        return x
    case bool:
        if x {
            return "true"
        }
        return "false"
    case float64:
        // JSON numbers come in as float64
        if x == float64(int64(x)) {
            return strconv.FormatInt(int64(x), 10)
        }
        return strconv.FormatFloat(x, 'f', -1, 64)
    case json.Number:
        return x.String()
    }
    // Everything else — marshal to JSON representation
    b, err := json.Marshal(v)
    if err != nil {
        return ""
    }
    return string(b)
}


func (s *Service) LayerSchema(ctx context.Context, layerID uuid.UUID) ([]FieldInfo, error) {
    _, t, err := s.resolve(ctx, layerID)
    if err != nil {
        return nil, err
    }
    return s.repo.SchemaFor(ctx, t)
}

func (s *Service) LayerName(ctx context.Context, layerID uuid.UUID) (string, error) {
    l, err := s.layersSvc.Get(ctx, layerID)
    if err != nil {
        return "", err
    }
    return l.Name, nil
}
