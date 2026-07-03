package auth

import (
    "encoding/json"
    "errors"
    "net/http"
    "strconv"
    "strings"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

// ─── DTOs ────────────────────────────────────────────

type UserDTO struct {
    ID            uuid.UUID  `json:"id"`
    Email         string     `json:"email"`
    DisplayName   string     `json:"display_name"`
    Role          Role     `json:"role"`
    Status        string     `json:"status"`
    AuthSource    string     `json:"auth_source"`
    Pending       bool       `json:"pending"`
    LastLoginAt   *time.Time `json:"last_login_at,omitempty"`
    CreatedAt     time.Time  `json:"created_at"`
    IsBreakGlass  bool       `json:"is_break_glass"`
}

type UsersListResponse struct {
    Users []UserDTO `json:"users"`
    Total int64     `json:"total"`
}

type UpdateUserRequest struct {
    DisplayName *string `json:"display_name,omitempty"`
    Role        *string `json:"role,omitempty"`
    Status      *string `json:"status,omitempty"`
}

// ─── Handler methods ─────────────────────────────────

// UsersList — GET /api/v1/users
// Query params: q (search), auth_source, status, role, page, limit
func (h *Handler) UsersList(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query()

    page := parseIntDefault(q.Get("page"), 1)
    limit := parseIntDefault(q.Get("limit"), 50)
    if limit > 200 {
        limit = 200
    }
    offset := (page - 1) * limit

    filter := UserListFilter{
        Search:     strings.TrimSpace(q.Get("q")),
        AuthSource: q.Get("auth_source"),
        Status:     q.Get("status"),
        Role:       q.Get("role"),
    }

    users, total, err := h.svc.ListUsers(r.Context(), filter, offset, limit)
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }

    // Load the break-glass admin email from env, if any
    breakGlassEmail := strings.ToLower(strings.TrimSpace(h.svc.superuserEmail))

    dtos := make([]UserDTO, 0, len(users))
    for _, u := range users {
        dtos = append(dtos, toUserFullDTO(u, breakGlassEmail))
    }

    httpx.JSON(w, http.StatusOK, UsersListResponse{Users: dtos, Total: total})
}

// UsersUpdate — PATCH /api/v1/users/:id
func (h *Handler) UsersUpdate(w http.ResponseWriter, r *http.Request) {
    targetID, ok := parseUserID(w, r)
    if !ok {
        return
    }

    var req UpdateUserRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }

    // TODO: prevent editing yourself once we wire up userFromContext.
    // The frontend already disables these buttons for the current user.

    updated, err := h.svc.UpdateUser(r.Context(), targetID, req)
    if err != nil {
        switch {
        case errors.Is(err, ErrUserNotFound):
            httpx.NotFound(w, "user not found")
        case errors.Is(err, ErrCannotEditBreakGlass):
            httpx.BadRequest(w, "cannot edit break-glass account")
        case errors.Is(err, ErrInvalidRole):
            httpx.BadRequest(w, "invalid role")
        case errors.Is(err, ErrInvalidStatus):
            httpx.BadRequest(w, "invalid status")
        default:
            httpx.Internal(w, h.logger, err)
        }
        return
    }

    breakGlassEmail := strings.ToLower(strings.TrimSpace(h.svc.superuserEmail))
    httpx.JSON(w, http.StatusOK, toUserFullDTO(updated, breakGlassEmail))
}

// UsersApprove — PATCH /api/v1/users/:id/approve
// Approves a pending Azure user with an initial role.
func (h *Handler) UsersApprove(w http.ResponseWriter, r *http.Request) {
    targetID, ok := parseUserID(w, r)
    if !ok {
        return
    }

    var req struct {
        Role string `json:"role"`
    }
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if req.Role == "" {
        req.Role = "viewer"
    }

    updated, err := h.svc.ApproveUser(r.Context(), targetID, req.Role)
    if err != nil {
        switch {
        case errors.Is(err, ErrUserNotFound):
            httpx.NotFound(w, "user not found")
        case errors.Is(err, ErrInvalidRole):
            httpx.BadRequest(w, "invalid role")
        default:
            httpx.Internal(w, h.logger, err)
        }
        return
    }

    breakGlassEmail := strings.ToLower(strings.TrimSpace(h.svc.superuserEmail))
    httpx.JSON(w, http.StatusOK, toUserFullDTO(updated, breakGlassEmail))
}

// ─── helpers ─────────────────────────────────────────

func parseIntDefault(s string, def int) int {
    if s == "" {
        return def
    }
    n, err := strconv.Atoi(s)
    if err != nil || n < 1 {
        return def
    }
    return n
}

func parseUserID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
    raw := chi.URLParam(r, "id")
    id, err := uuid.Parse(raw)
    if err != nil {
        httpx.BadRequest(w, "invalid user id")
        return uuid.UUID{}, false
    }
    return id, true
}

func toUserFullDTO(u *User, breakGlassEmail string) UserDTO {
    isBreak := strings.EqualFold(strings.TrimSpace(u.Email), breakGlassEmail)
    return UserDTO{
        ID:           u.ID,
        Email:        u.Email,
        DisplayName:  u.DisplayName,
        Role:         u.Role,
        Status:       u.Status,
        AuthSource:   u.AuthSource,
        Pending:      u.Pending,
        LastLoginAt:  u.LastLoginAt,
        CreatedAt:    u.CreatedAt,
        IsBreakGlass: isBreak,
    }
}



// Silence unused-import in some builds
var _ = json.RawMessage(nil)
