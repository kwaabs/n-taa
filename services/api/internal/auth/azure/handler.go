package azure

import (
    "context"
    "crypto/rand"
    "encoding/base64"
    "log/slog"
    "net/http"
    "net/url"
    "strings"
    "time"

    "github.com/uptrace/bun"

    "github.com/kwaabs/ntaa/services/api/internal/auth"
    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

// Handler serves the Azure OAuth2 endpoints.
type Handler struct {
    cfg     *Config
    db      *bun.DB
    authSvc *auth.Service
    logger  *slog.Logger
}

// NewHandler creates the Azure OAuth handler.
// If Azure isn't configured, returns nil (endpoints won't be mounted).
func NewHandler(db *bun.DB, authSvc *auth.Service, logger *slog.Logger) *Handler {
    cfg, err := LoadConfig()
    if err != nil {
        logger.Info("azure auth disabled", "reason", err.Error())
        return nil
    }
    return &Handler{cfg: cfg, db: db, authSvc: authSvc, logger: logger}
}

// LoginURL builds the Azure OAuth login redirect URL.
// GET /api/v1/auth/azure/login
func (h *Handler) LoginURL(w http.ResponseWriter, r *http.Request) {
    state, err := generateState()
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }

    http.SetCookie(w, &http.Cookie{
        Name:     "azure_oauth_state",
        Value:    state,
        Path:     "/",
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
        Secure:   isSecure(r),
        MaxAge:   600,
    })

    params := url.Values{}
    params.Set("client_id", h.cfg.ClientID)
    params.Set("response_type", "code")
    params.Set("redirect_uri", h.cfg.RedirectURI)
    params.Set("response_mode", "query")
    params.Set("scope", strings.Join(h.cfg.Scopes, " "))
    params.Set("state", state)

    httpx.JSON(w, http.StatusOK, map[string]string{
        "login_url": h.cfg.AuthorizeEndpoint() + "?" + params.Encode(),
    })
}

type callbackRequest struct {
    Code  string `json:"code"`
    State string `json:"state"`
}

// Callback handles the Azure OAuth callback.
// POST /api/v1/auth/azure/callback
func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
    var req callbackRequest
    if err := httpx.DecodeJSON(r, &req); err != nil {
        httpx.BadRequest(w, "invalid callback body")
        return
    }
    if req.Code == "" {
        httpx.BadRequest(w, "code is required")
        return
    }

    cookie, err := r.Cookie("azure_oauth_state")
    if err != nil || cookie.Value != req.State {
        httpx.BadRequest(w, "invalid state")
        return
    }

    http.SetCookie(w, &http.Cookie{
        Name: "azure_oauth_state", Path: "/", MaxAge: -1,
    })

    tokens, err := ExchangeCode(r.Context(), h.cfg, req.Code)
    if err != nil {
        h.logger.Error("azure token exchange failed", "err", err.Error())
        httpx.BadRequest(w, "azure sign-in failed")
        return
    }

    claims, err := ValidateIDToken(r.Context(), h.cfg, tokens.IDToken)
    if err != nil {
        h.logger.Error("azure id token invalid", "err", err.Error())
        httpx.BadRequest(w, "invalid azure token")
        return
    }

    user, err := h.provisionUser(r.Context(), claims)
    if err != nil {
        h.logger.Error("provision user failed", "err", err.Error())
        httpx.Internal(w, h.logger, err)
        return
    }

    if user.Pending {
        httpx.JSON(w, http.StatusOK, map[string]any{
            "pending": true,
            "user": map[string]any{
                "email":        user.Email,
                "display_name": user.DisplayName,
            },
        })
        return
    }

    // Mint tokens exactly like LoginLocal does
    result, err := h.authSvc.Issue(r.Context(), user)
    if err != nil {
        httpx.Internal(w, h.logger, err)
        return
    }

    // Refresh cookie via the shared service helper — same shape as LoginLocal
    h.authSvc.WriteRefreshCookie(w, r, result.RefreshToken, result.RefreshExpiresAt)

    httpx.JSON(w, http.StatusOK, map[string]any{
        "pending":      false,
        "access_token": result.AccessToken,
        "expires_at":   result.AccessExpiresAt,
        "user": map[string]any{
            "id":           user.ID,
            "email":        user.Email,
            "display_name": user.DisplayName,
            "role":         user.Role,
        },
    })
}

// provisionUser upserts a user record from Azure ID token claims.
func (h *Handler) provisionUser(ctx context.Context, c *IDTokenClaims) (*auth.User, error) {
    var user auth.User

    // Find by azure_object_id
    err := h.db.NewSelect().
        Model(&user).
        Where("azure_object_id = ?", c.Oid).
        Scan(ctx)

    if err == nil {
        _, err := h.db.NewUpdate().
            Model(&user).
            Set("last_login_at = ?", time.Now()).
            WherePK().
            Exec(ctx)
        return &user, err
    }

    // Not found by oid — check for existing email (link account)
    err = h.db.NewSelect().
        Model(&user).
        Where("email = ?", strings.ToLower(c.Email)).
        Scan(ctx)

    if err == nil {
        oidCopy := c.Oid
        user.AzureObjectID = &oidCopy
        user.AuthSource = "azure"
        now := time.Now()
        user.LastLoginAt = &now
        _, updErr := h.db.NewUpdate().Model(&user).WherePK().Exec(ctx)
        return &user, updErr
    }

    // Brand new — JIT provision as pending
    oidCopy := c.Oid
    name := c.Name
    if name == "" {
        name = c.Email
    }
    now := time.Now()
    newUser := &auth.User{
        Email:         strings.ToLower(c.Email),
        DisplayName:   name,
        Role:          "viewer",
        Status:        "active",
        AuthSource:    "azure",
        AzureObjectID: &oidCopy,
        Pending:       true,
        LastLoginAt:   &now,
    }
    _, err = h.db.NewInsert().Model(newUser).Exec(ctx)
    return newUser, err
}

func generateState() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.URLEncoding.EncodeToString(b), nil
}

func isSecure(r *http.Request) bool {
    if r.TLS != nil {
        return true
    }
    return r.Header.Get("X-Forwarded-Proto") == "https"
}
