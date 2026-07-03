package features

import (
    "encoding/json"
    "errors"
    "log/slog"
    "net/http"
    "strconv"
    "strings"
    "time"
    "bytes"
    "io"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

type Handler struct {
    svc    *Service
    logger *slog.Logger
}

func NewHandler(svc *Service, logger *slog.Logger) *Handler {
    return &Handler{svc: svc, logger: logger}
}

type featureRequest struct {
    Type       string          `json:"type"`
    Geometry   json.RawMessage `json:"geometry"`
    Properties json.RawMessage `json:"properties"`
}

// GET /api/v1/layers/{layerId}/features/count
func (h *Handler) Count(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    n, err := h.svc.Count(r.Context(), layerID)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, map[string]int64{"count": n})
}

// GET /api/v1/layers/{layerId}/features?bbox=xmin,ymin,xmax,ymax&limit=100
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    q := r.URL.Query()
    bbox, err := parseBBox(q.Get("bbox"))
    if err != nil {
        httpx.BadRequest(w, "invalid bbox (want xmin,ymin,xmax,ymax)")
        return
    }
    limit, _ := strconv.Atoi(q.Get("limit"))

    fc, err := h.svc.List(r.Context(), layerID, bbox, limit)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, fc)
}

// GET /api/v1/layers/{layerId}/features/{ogcFid}
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    ogcFid, ok := parseOgcFid(w, r)
    if !ok {
        return
    }
    f, err := h.svc.Get(r.Context(), layerID, ogcFid)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, f)
}

// POST /api/v1/layers/{layerId}/features
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    var req featureRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    f, err := h.svc.Create(r.Context(), layerID, req.Geometry, req.Properties)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusCreated, f)
}

// PATCH /api/v1/layers/{layerId}/features/{ogcFid}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    ogcFid, ok := parseOgcFid(w, r)
    if !ok {
        return
    }
    var req featureRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    f, err := h.svc.Update(r.Context(), layerID, ogcFid, req.Geometry, req.Properties)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, f)
}

// DELETE /api/v1/layers/{layerId}/features/{ogcFid}
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    ogcFid, ok := parseOgcFid(w, r)
    if !ok {
        return
    }
    if err := h.svc.Delete(r.Context(), layerID, ogcFid); err != nil {
        writeErr(w, h.logger, err)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}


type queryRequest struct {
    Within       json.RawMessage `json:"within"`

    Filters      *Filter         `json:"filters,omitempty"` // ← NEW

    Sort         []SortField     `json:"sort,omitempty"`
    Cursor       string          `json:"cursor,omitempty"`
    Limit        int             `json:"limit,omitempty"`
    IncludeCount bool            `json:"include_count,omitempty"`
}

type queryResponse struct {
    Type       string      `json:"type"`
    Features   []Feature   `json:"features"`
    TotalCount *int64      `json:"total_count,omitempty"`
    Estimated  bool        `json:"estimated_count,omitempty"`
    NextCursor string      `json:"next_cursor,omitempty"`
}

// POST /api/v1/layers/{layerId}/features/query
func (h *Handler) Query(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    var req queryRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if len(req.Within) == 0 {
        httpx.BadRequest(w, "within geometry is required")
        return
    }

    result, err := h.svc.QueryPaginated(r.Context(), layerID, QueryParams{
        Geometry:     req.Within,

        Filters:      req.Filters,       // ← NEW

        Sort:         req.Sort,
        Cursor:       req.Cursor,
        Limit:        req.Limit,
        IncludeCount: req.IncludeCount,
    })
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }

    httpx.JSON(w, http.StatusOK, queryResponse{
        Type:       "FeatureCollection",
        Features:   result.Features,
        TotalCount: result.TotalCount,
        Estimated:  result.Estimated,
        NextCursor: result.NextCursor,
    })
}

// POST /api/v1/layers/{layerId}/features/count
// (POST because body contains geometry)
func (h *Handler) CountWithin(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    var req queryRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if len(req.Within) == 0 {
        httpx.BadRequest(w, "within geometry is required")
        return
    }
    n, err := h.svc.CountWithin(r.Context(), layerID, req.Within, req.Filters) // ← NEW arg
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, map[string]int64{"count": n})
}

// ---------- helpers ----------

func parseLayerID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
    id, err := uuid.Parse(chi.URLParam(r, "layerId"))
    if err != nil {
        httpx.BadRequest(w, "invalid layer id")
        return uuid.Nil, false
    }
    return id, true
}

func parseOgcFid(w http.ResponseWriter, r *http.Request) (int64, bool) {
    raw := chi.URLParam(r, "ogcFid")
    n, err := strconv.ParseInt(raw, 10, 64)
    if err != nil || n < 0 {
        httpx.BadRequest(w, "invalid feature id")
        return 0, false
    }
    return n, true
}

func parseBBox(raw string) (*[4]float64, error) {
    if raw == "" {
        return nil, nil
    }
    parts := strings.Split(raw, ",")
    if len(parts) != 4 {
        return nil, errors.New("bbox must have 4 parts")
    }
    var out [4]float64
    for i, p := range parts {
        v, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
        if err != nil {
            return nil, err
        }
        out[i] = v
    }
    return &out, nil
}

func writeErr(w http.ResponseWriter, logger *slog.Logger, err error) {
    switch {
    case errors.Is(err, ErrLayerNotFound):
        httpx.NotFound(w, "layer not found")
    case errors.Is(err, ErrFeatureNotFound):
        httpx.NotFound(w, "feature not found")
    case errors.Is(err, ErrLayerReadOnly):
        httpx.Forbidden(w, "layer is read-only")
    case errors.Is(err, ErrInvalidInput):
        httpx.BadRequest(w, "invalid input")
    default:
        httpx.Internal(w, logger, err)
    }
}


type exportRequest struct {
    Within  json.RawMessage `json:"within"`

    Filters *Filter         `json:"filters,omitempty"` // ← NEW

    Sort    []SortField     `json:"sort,omitempty"`
    Columns []string        `json:"columns,omitempty"`
}

// POST /api/v1/layers/{layerId}/features/export.csv
func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    var req exportRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if len(req.Within) == 0 {
        httpx.BadRequest(w, "within geometry is required")
        return
    }

    // Build filename: <layer_name>_YYYYMMDD_HHMMSS.csv
    // We don't have the layer name here in a nice form; fall back to id.
    stamp := time.Now().UTC().Format("20060102_150405")
    filename := "export_" + stamp + ".csv"

    w.Header().Set("Content-Type", "text/csv; charset=utf-8")
    w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
    w.Header().Set("Cache-Control", "no-store")
    w.Header().Set("X-Content-Type-Options", "nosniff")

    if err := h.svc.StreamCSV(r.Context(), layerID, ExportCSVParams{
        Geometry: req.Within,

        Filters:  req.Filters,           // ← NEW

        Sort:     req.Sort,
        Columns:  req.Columns,
    }, w); err != nil {
        // Can't switch to a JSON error mid-stream if we've already written data.
        // Log it; the client will just see a truncated file.
        h.logger.Error("csv export failed", "err", err.Error())
    }
}



// GET /api/v1/layers/{layerId}/schema
func (h *Handler) Schema(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    fields, err := h.svc.LayerSchema(r.Context(), layerID)
    if err != nil {
        writeErr(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, fields)
}





// POST /api/v1/layers/{layerId}/features/export.{fmt}
// fmt ∈ { csv, xlsx, geojson }
func (h *Handler) Export(w http.ResponseWriter, r *http.Request) {
    layerID, ok := parseLayerID(w, r)
    if !ok {
        return
    }
    fmtParam := strings.ToLower(chi.URLParam(r, "fmt"))
    var req exportRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if len(req.Within) == 0 {
        httpx.BadRequest(w, "within geometry is required")
        return
    }

    stamp := time.Now().UTC().Format("20060102_150405")

    switch fmtParam {
    case "csv":
        filename := "export_" + stamp + ".csv"
        w.Header().Set("Content-Type", "text/csv; charset=utf-8")
        w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
        if err := h.svc.StreamCSV(r.Context(), layerID, ExportCSVParams{
            Geometry: req.Within, Sort: req.Sort, Columns: req.Columns, Filters: req.Filters,
        }, w); err != nil {
            h.logger.Error("csv export failed", "err", err.Error())
        }

    case "xlsx", "excel":
        filename := "export_" + stamp + ".xlsx"
        w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
        layerName := "Export"
        if l, err := h.svc.LayerName(r.Context(), layerID); err == nil {
            layerName = l
        }
        if err := h.svc.StreamXLSX(r.Context(), layerID.String(), ExportCSVParams{
            Geometry: req.Within, Sort: req.Sort, Columns: req.Columns, Filters: req.Filters,
        }, layerName, w); err != nil {
            h.logger.Error("xlsx export failed", "err", err.Error())
        }

    case "geojson", "json":
        filename := "export_" + stamp + ".geojson"
        w.Header().Set("Content-Type", "application/geo+json")
        w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
        if err := h.svc.StreamGeoJSON(r.Context(), layerID.String(), ExportCSVParams{
            Geometry: req.Within, Sort: req.Sort, Filters: req.Filters,
        }, w); err != nil {
            h.logger.Error("geojson export failed", "err", err.Error())
        }

    default:
        httpx.BadRequest(w, "unsupported format: "+fmtParam)
    }
}

// POST /api/v1/layers/{layerId}/export.{fmt}
// Whole-layer export — same body/format handling but geometry defaults to world.
// POST /api/v1/layers/{layerId}/export.{fmt}
// Whole-layer export — reuses Export() but injects world bounds if none supplied.
func (h *Handler) ExportLayer(w http.ResponseWriter, r *http.Request) {
    if _, ok := parseLayerID(w, r); !ok {
        return
    }

    // TODO: enforce layer export permission once features handler
    // has a reference to layers.Service. View filtering already happens
    // via the layers list endpoint.

    // Read the body; if empty or no `within`, inject world bounds.
    var req exportRequest
    _ = httpx.DecodeJSON(r, &req)
    if len(req.Within) == 0 {
        req.Within = json.RawMessage(
            `{"type":"Polygon","coordinates":[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}`,
        )
    }

    // Re-serialize and hand off to the standard Export handler by
    // replacing the body. Route param {fmt} is already set by chi.
    body, err := json.Marshal(req)
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }

    r2 := r.Clone(r.Context())
    r2.Body = io.NopCloser(bytes.NewReader(body))
    r2.ContentLength = int64(len(body))
    h.Export(w, r2)
}
