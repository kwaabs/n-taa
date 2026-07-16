package layers

import (
    "context"
    "errors"
    "log/slog"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/kwaabs/ntaa/services/api/internal/auth"
    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

type Handler struct {
	svc           *Service
	logger        *slog.Logger
	martinBaseURL string
}

func NewHandler(svc *Service, logger *slog.Logger, martinBaseURL string) *Handler {
	return &Handler{svc: svc, logger: logger, martinBaseURL: martinBaseURL}
}

// ─── DTOs ─────────────────────────────────────────────

type layerDTO struct {
    ID             string           `json:"id"`
    Name           string           `json:"name"`
    DisplayName    string           `json:"display_name"`
    SchemaName     string           `json:"schema_name"`
    TableName      string           `json:"table_name"`
    IDColumn       string           `json:"id_column"`
    GeometryColumn string           `json:"geometry_column"`
    GeometryType   string           `json:"geometry_type"`
    SRID           int              `json:"srid"`
    Editable       bool             `json:"editable"`
    Style          any              `json:"style"`
    TileURL        string           `json:"tile_url"`
    Permissions    LayerPermissions `json:"permissions"`
}

func (h *Handler) buildTileURL(schema, table string) string {
	return h.martinBaseURL + "/" + schema + "." + table + "/{z}/{x}/{y}"
}

// toDTO — single layer → DTO
func (h *Handler) h.toDTO(l *Layer) layerDTO {
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
		TileURL:        h.buildTileURL(l.SchemaName, l.TableName),
		Permissions:    l.Permissions,
	}
}

// toDTOs — slice of layers → slice of DTOs
func (h *Handler) h.toDTOs(ls []Layer) []layerDTO {
	out := make([]layerDTO, 0, len(ls))
	for i := range ls {
		out = append(out, h.toDTO(&ls[i]))
	}
	return out
}

// ─── Context helpers ──────────────────────────────────

func roleFromContext(ctx context.Context) (string, bool) {
    role, ok := auth.RoleFromContext(ctx)
    if !ok {
        return "", false
    }
    return string(role), true
}

func parseID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        httpx.BadRequest(w, "invalid layer id")
        return uuid.UUID{}, false
    }
    return id, true
}

// ─── Request bodies ───────────────────────────────────

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

type updatePermissionsRequest struct {
    ViewRoles   []string `json:"view_roles"`
    ExportRoles []string `json:"export_roles"`
}

// ─── Handlers ─────────────────────────────────────────

// GET /api/v1/layers
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    role, ok := roleFromContext(r.Context())
    if !ok {
        httpx.Unauthorized(w, "no user in context")
        return
    }

    layers, err := h.svc.ListForRole(r.Context(), role)
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, h.toDTOs(layers))
}

// GET /api/v1/layers/{id}
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    id, ok := parseID(w, r)
    if !ok {
        return
    }
    role, ok := roleFromContext(r.Context())
    if !ok {
        httpx.Unauthorized(w, "no user in context")
        return
    }

    l, err := h.svc.GetForRole(r.Context(), id, role)
    if err != nil {
        if errors.Is(err, ErrForbidden) {
            httpx.Forbidden(w, "you don't have access to this layer")
            return
        }
        httpx.Internal(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, h.toDTO(l))
}

// POST /api/v1/layers
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
    httpx.JSON(w, http.StatusCreated, h.toDTO(l))
}

// PATCH /api/v1/layers/{id}
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
    httpx.JSON(w, http.StatusOK, h.toDTO(l))
}

// DELETE /api/v1/layers/{id}
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

// PATCH /api/v1/layers/{id}/permissions — superuser only
func (h *Handler) UpdatePermissions(w http.ResponseWriter, r *http.Request) {
    id, ok := parseID(w, r)
    if !ok {
        return
    }

    var req updatePermissionsRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }

    validRoles := map[string]bool{"superuser": true, "editor": true, "viewer": true}
    for _, role := range req.ViewRoles {
        if !validRoles[role] {
            httpx.BadRequest(w, "invalid view role: "+role)
            return
        }
    }
    for _, role := range req.ExportRoles {
        if !validRoles[role] {
            httpx.BadRequest(w, "invalid export role: "+role)
            return
        }
    }

    updated, err := h.svc.UpdatePermissions(r.Context(), id, LayerPermissions{
        ViewRoles:   req.ViewRoles,
        ExportRoles: req.ExportRoles,
    })
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }
    httpx.JSON(w, http.StatusOK, h.toDTO(updated))
}
