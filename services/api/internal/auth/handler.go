package auth

import (
    "errors"
    "log/slog"
    "net/http"
    "time"

    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

const refreshCookieName = "geo_refresh"
const refreshCookiePath = "/api/v1/auth"

type Handler struct {
    svc          *Service
    logger       *slog.Logger
    cookieDomain string
    cookieSecure bool
}

func NewHandler(svc *Service, logger *slog.Logger, cookieDomain string, cookieSecure bool) *Handler {
    return &Handler{svc: svc, logger: logger, cookieDomain: cookieDomain, cookieSecure: cookieSecure}
}

type loginRequest struct {
    Email    string `json:"email"`
    Password string `json:"password"`
}

type userDTO struct {
    ID          string `json:"id"`
    Email       string `json:"email"`
    DisplayName string `json:"display_name"`
    Role        string `json:"role"`
}

type loginResponse struct {
    AccessToken string    `json:"access_token"`
    ExpiresAt   time.Time `json:"expires_at"`
    User        userDTO   `json:"user"`
}

func toUserDTO(u *User) userDTO {
    return userDTO{
        ID:          u.ID.String(),
        Email:       u.Email,
        DisplayName: u.DisplayName,
        Role:        string(u.Role),
    }
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
    var req loginRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid JSON body")
        return
    }
    if req.Email == "" || req.Password == "" {
        httpx.BadRequest(w, "email and password are required")
        return
    }

    res, err := h.svc.LoginLocal(r.Context(), req.Email, req.Password)
    if err != nil {
        switch {
        case errors.Is(err, ErrInvalidCredentials):
            httpx.Unauthorized(w, "invalid email or password")
        case errors.Is(err, ErrUserDisabled):
            httpx.Forbidden(w, "user is disabled")
        default:
            httpx.Internal(w, h.logger, err)
        }
        return
    }
    h.setRefreshCookie(w, res.RefreshToken, res.RefreshExpiresAt)
    httpx.JSON(w, http.StatusOK, loginResponse{
        AccessToken: res.AccessToken,
        ExpiresAt:   res.AccessExpiresAt,
        User:        toUserDTO(res.User),
    })
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
    c, err := r.Cookie(refreshCookieName)
    if err != nil {
        httpx.Unauthorized(w, "missing refresh token")
        return
    }
    res, err := h.svc.Refresh(r.Context(), c.Value)
    if err != nil {
        if errors.Is(err, ErrInvalidRefresh) {
            h.clearRefreshCookie(w)
            httpx.Unauthorized(w, "invalid refresh token")
            return
        }
        httpx.Internal(w, h.logger, err)
        return
    }
    h.setRefreshCookie(w, res.RefreshToken, res.RefreshExpiresAt)
    httpx.JSON(w, http.StatusOK, loginResponse{
        AccessToken: res.AccessToken,
        ExpiresAt:   res.AccessExpiresAt,
        User:        toUserDTO(res.User),
    })
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
    if c, err := r.Cookie(refreshCookieName); err == nil && c.Value != "" {
        _ = h.svc.Logout(r.Context(), c.Value)
    }
    h.clearRefreshCookie(w)
    w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
    u, ok := UserFromContext(r.Context())
    if !ok {
        httpx.Unauthorized(w, "not authenticated")
        return
    }
    httpx.JSON(w, http.StatusOK, toUserDTO(u))
}

func (h *Handler) setRefreshCookie(w http.ResponseWriter, value string, exp time.Time) {
    http.SetCookie(w, &http.Cookie{
        Name:     refreshCookieName,
        Value:    value,
        Path:     refreshCookiePath,
        Domain:   h.cookieDomain,
        Expires:  exp,
        HttpOnly: true,
        Secure:   h.cookieSecure,
        SameSite: http.SameSiteLaxMode,
    })
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
    http.SetCookie(w, &http.Cookie{
        Name:     refreshCookieName,
        Value:    "",
        Path:     refreshCookiePath,
        Domain:   h.cookieDomain,
        Expires:  time.Unix(0, 0),
        MaxAge:   -1,
        HttpOnly: true,
        Secure:   h.cookieSecure,
        SameSite: http.SameSiteLaxMode,
    })
}
