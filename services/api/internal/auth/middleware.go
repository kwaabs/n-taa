package auth

import (
    "context"
    "net/http"
    "strings"

    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

type ctxKey int

const userCtxKey ctxKey = 1

func WithUser(ctx context.Context, u *User) context.Context {
    return context.WithValue(ctx, userCtxKey, u)
}

func UserFromContext(ctx context.Context) (*User, bool) {
    u, ok := ctx.Value(userCtxKey).(*User)
    return u, ok
}

type Middleware struct {
    issuer *TokenIssuer
    repo   *Repo
}

func NewMiddleware(issuer *TokenIssuer, repo *Repo) *Middleware {
    return &Middleware{issuer: issuer, repo: repo}
}

func (m *Middleware) RequireUser(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        raw := extractBearer(r)
        if raw == "" {
            httpx.Unauthorized(w, "missing bearer token")
            return
        }
        claims, err := m.issuer.Parse(raw)
        if err != nil {
            httpx.Unauthorized(w, "invalid token")
            return
        }
        u, err := m.repo.GetUserByID(r.Context(), claims.UserID)
        if err != nil {
            httpx.Unauthorized(w, "user lookup failed")
            return
        }
        if u == nil || u.Status != StatusActive {
            httpx.Unauthorized(w, "user not active")
            return
        }
        next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u)))
    })
}

func (m *Middleware) RequireRole(roles ...Role) func(http.Handler) http.Handler {
    allowed := map[Role]struct{}{}
    for _, r := range roles {
        allowed[r] = struct{}{}
    }
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            u, ok := UserFromContext(r.Context())
            if !ok {
                httpx.Unauthorized(w, "not authenticated")
                return
            }
            if _, ok := allowed[u.Role]; !ok {
                httpx.Forbidden(w, "insufficient role")
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}

func extractBearer(r *http.Request) string {
    h := r.Header.Get("Authorization")
    if !strings.HasPrefix(h, "Bearer ") {
        return ""
    }
    return strings.TrimPrefix(h, "Bearer ")
}
