package layers

import (
    "errors"
    "log/slog"
    "net/http"

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

type layerDTO struct {
    ID             string `json:"id"`
    Name           string `json:"name"`
    DisplayName    string `json:"display_name"`
    SchemaName     string `json:"schema_name"`
    TableName      string `json:"table_name"`
    IDColumn       string `json:"id_column"`
    GeometryColumn string `json:"geometry_column"`
    GeometryType   string `json:"geometry_type"`
    SRID           int    `json:"srid"`
    Editable       bool   `json:"editable"`
    Style          any    `json:"style"`
    TileURL        string `json:"tile_url"`
}

func buildTileURL(schema, table string) string {
    return "http://localhost:5441/" + schema + "." + table + "/{z}/{x}/{y}"
}

func toDTO(l *Layer) layerDTO {
    return layerDTO{
        ID:             l.ID.String(),
        Name:           l.Name,
        DisplayName:    l.DisplayName,
        SchemaName:     l.SchemaName,
        TableName:      l.TableName,
        IDColumn:       l.IDColumn,
        GeometryColumn: l.GeometryColumn,
        GeometryType:   l.GeometryType,
        SRID:           l.SRID,
        Editable:       l.Editable,
        Style:          l.Style,
        TileURL:        buildTileURL(l.SchemaName, l.TableName),
    }
}

type createRequest struct {
    Name           string `json:"name"`
    DisplayName    string `json:"display_name"`
    SchemaName     string `json:"schema_name"`
    TableName      string `json:"table_name"`
    IDColumn       string `json:"id_column"`
    GeometryColumn string `json:"geometry_column"`
    GeometryType   string `json:"geometry_type"`
    SRID           int    `json:"srid"`
    Editable       *bool  `json:"editable"`
    Style          any    `json:"style"`
}

type updateRequest struct {
    DisplayName *string `json:"display_name"`
    Editable    *bool   `json:"editable"`
    Style       any     `json:"style"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    layers, err := h.svc.List(r.Context())
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }
    out := make([]layerDTO, 0, len(layers))
    for i := range layers {
        out = append(out, toDTO(&layers[i]))
    }
    httpx.JSON(w, http.StatusOK, out)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        httpx.BadRequest(w, "invalid layer id")
        return
    }
    l, err := h.svc.Get(r.Context(), id)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            httpx.NotFound(w, "layer not found")
            return
        }
        httpx.Internal(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, toDTO(l))
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    var req createRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    editable := true
    if req.Editable != nil {
        editable = *req.Editable
    }
    l, err := h.svc.Create(r.Context(), CreateInput{
        Name:           req.Name,
        DisplayName:    req.DisplayName,
        SchemaName:     req.SchemaName,
        TableName:      req.TableName,
        IDColumn:       req.IDColumn,
        GeometryColumn: req.GeometryColumn,
        GeometryType:   req.GeometryType,
        SRID:           req.SRID,
        Editable:       editable,
        Style:          req.Style,
    })
    if err != nil {
        switch {
        case errors.Is(err, ErrInvalidInput):
            httpx.BadRequest(w, "invalid input")
        case errors.Is(err, ErrDuplicate):
            httpx.Conflict(w, "layer already exists")
        case errors.Is(err, ErrPhysicalMissing):
            httpx.BadRequest(w, "physical table does not exist")
        default:
            httpx.Internal(w, h.logger, err)
        }
        return
    }
    httpx.JSON(w, http.StatusCreated, toDTO(l))
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        httpx.BadRequest(w, "invalid layer id")
        return
    }
    var req updateRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    l, err := h.svc.Update(r.Context(), id, UpdateInput{
        DisplayName: req.DisplayName,
        Editable:    req.Editable,
        Style:       req.Style,
    })
    if err != nil {
        switch {
        case errors.Is(err, ErrNotFound):
            httpx.NotFound(w, "layer not found")
        case errors.Is(err, ErrInvalidInput):
            httpx.BadRequest(w, "invalid input")
        default:
            httpx.Internal(w, h.logger, err)
        }
        return
    }
    httpx.JSON(w, http.StatusOK, toDTO(l))
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        httpx.BadRequest(w, "invalid layer id")
        return
    }
    if err := h.svc.Delete(r.Context(), id); err != nil {
        if errors.Is(err, ErrNotFound) {
            httpx.NotFound(w, "layer not found")
            return
        }
        httpx.Internal(w, h.logger, err)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}
