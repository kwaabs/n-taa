package auth

import (
    "context"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "errors"
    "time"

    "strings"

    "github.com/google/uuid"

    "net/http"

)

var (
    ErrInvalidCredentials = errors.New("invalid credentials")
    ErrUserDisabled       = errors.New("user disabled")
    ErrInvalidRefresh     = errors.New("invalid refresh token")
)

type Service struct {
    repo       *Repo
    access     *TokenIssuer
    refreshTTL time.Duration

    superuserEmail string

}

// After
func NewService(repo *Repo, tokenIssuer *TokenIssuer, refreshTTL time.Duration, superuserEmail string) *Service {
    return &Service{
        repo:           repo,
        access:         tokenIssuer,       // ← was tokenIssuer:, must be access:
        refreshTTL:     refreshTTL,
        superuserEmail: superuserEmail,
    }
}

func (s *Service) SuperuserEmail() string { return s.superuserEmail }

type LoginResult struct {
    AccessToken      string
    AccessExpiresAt  time.Time
    RefreshToken     string
    RefreshExpiresAt time.Time
    User             *User
}

func (s *Service) LoginLocal(ctx context.Context, email, password string) (*LoginResult, error) {
    u, err := s.repo.GetUserByEmail(ctx, email)
    if err != nil {
        return nil, err
    }
    if u == nil {
        return nil, ErrInvalidCredentials
    }
    if u.Status != StatusActive {
        return nil, ErrUserDisabled
    }

    id, err := s.repo.GetLocalIdentity(ctx, email)
    if err != nil {
        return nil, err
    }
    if id == nil || id.PasswordHash == nil {
        return nil, ErrInvalidCredentials
    }
    if !VerifyPassword(*id.PasswordHash, password) {
        return nil, ErrInvalidCredentials
    }
    return s.Issue(ctx, u)
}

func (s *Service) Refresh(ctx context.Context, refresh string) (*LoginResult, error) {
    rt, err := s.repo.GetRefreshByHash(ctx, hashOpaque(refresh))
    if err != nil {
        return nil, err
    }
    if rt == nil || rt.RevokedAt != nil || time.Now().After(rt.ExpiresAt) {
        return nil, ErrInvalidRefresh
    }
    u, err := s.repo.GetUserByID(ctx, rt.UserID)
    if err != nil {
        return nil, err
    }
    if u == nil || u.Status != StatusActive {
        return nil, ErrInvalidRefresh
    }
    if err := s.repo.RevokeRefresh(ctx, rt.ID); err != nil {
        return nil, err
    }
    return s.Issue(ctx, u)
}

func (s *Service) Logout(ctx context.Context, refresh string) error {
    if refresh == "" {
        return nil
    }
    rt, err := s.repo.GetRefreshByHash(ctx, hashOpaque(refresh))
    if err != nil {
        return err
    }
    if rt == nil {
        return nil
    }
    return s.repo.RevokeRefresh(ctx, rt.ID)
}

func (s *Service) Issue(ctx context.Context, u *User) (*LoginResult, error) {
    access, accessExp, err := s.access.Issue(u.ID, u.Role)
    if err != nil {
        return nil, err
    }
    refresh, err := generateOpaque(32)
    if err != nil {
        return nil, err
    }
    refreshExp := time.Now().Add(s.refreshTTL)
    rt := &RefreshToken{
        UserID:    u.ID,
        TokenHash: hashOpaque(refresh),
        ExpiresAt: refreshExp,
    }
    if err := s.repo.InsertRefreshToken(ctx, rt); err != nil {
        return nil, err
    }
    return &LoginResult{
        AccessToken:      access,
        AccessExpiresAt:  accessExp,
        RefreshToken:     refresh,
        RefreshExpiresAt: refreshExp,
        User:             u,
    }, nil
}


// WriteRefreshCookie sets the refresh cookie on the response.
// Used by both LoginLocal handler and Azure OAuth handler.
func (s *Service) WriteRefreshCookie(w http.ResponseWriter, r *http.Request, token string, expiresAt time.Time) {
    http.SetCookie(w, &http.Cookie{
        Name: refreshCookieName,   // or hard-code the same name used in handler.go
        Value:    token,
        Path:     "/",
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
        Secure:   isSecureRequest(r),
        Expires:  expiresAt,
    })
}


// ─── User management ─────────────────────────────────

var (
    ErrUserNotFound         = errors.New("user not found")
    ErrCannotEditBreakGlass = errors.New("cannot edit break-glass account")
    ErrInvalidRole          = errors.New("invalid role")
    ErrInvalidStatus        = errors.New("invalid status")
)

var (
    validRoles    = map[string]bool{"superuser": true, "editor": true, "viewer": true}
    validStatuses = map[string]bool{"active": true, "inactive": true}
)

type UserListFilter struct {
    Search     string
    AuthSource string
    Status     string
    Role       string
}

func (s *Service) ListUsers(ctx context.Context, f UserListFilter, offset, limit int) ([]*User, int64, error) {
    return s.repo.ListUsers(ctx, f, offset, limit)
}

func (s *Service) UpdateUser(ctx context.Context, id uuid.UUID, req UpdateUserRequest) (*User, error) {
    u, err := s.repo.GetUserByID(ctx, id)
    if err != nil {
        return nil, ErrUserNotFound
    }

    // Break-glass account is env-managed, not editable via UI
    if strings.EqualFold(strings.TrimSpace(u.Email), strings.TrimSpace(s.superuserEmail)) {
        return nil, ErrCannotEditBreakGlass
    }

    if req.Role != nil {
        if !validRoles[*req.Role] {
            return nil, ErrInvalidRole
        }

        u.Role = Role(*req.Role)   // ← cast to Role
    }
    if req.Status != nil {
        if !validStatuses[*req.Status] {
            return nil, ErrInvalidStatus
        }
        u.Status = *req.Status
    }
    if req.DisplayName != nil {
        u.DisplayName = strings.TrimSpace(*req.DisplayName)
    }

    if err := s.repo.UpdateUser(ctx, u); err != nil {
        return nil, err
    }
    return u, nil
}

func (s *Service) ApproveUser(ctx context.Context, id uuid.UUID, role string) (*User, error) {
    u, err := s.repo.GetUserByID(ctx, id)
    if err != nil {
        return nil, ErrUserNotFound
    }
    if role == "" {
        role = "viewer"
    }
    if !validRoles[role] {
        return nil, ErrInvalidRole
    }

    u.Pending = false
    u.Role = Role(role)
    u.Status = "active"

    if err := s.repo.UpdateUser(ctx, u); err != nil {
        return nil, err
    }
    return u, nil
}



func isSecureRequest(r *http.Request) bool {
    if r.TLS != nil {
        return true
    }
    return r.Header.Get("X-Forwarded-Proto") == "https"
}

func generateOpaque(n int) (string, error) {
    b := make([]byte, n)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashOpaque(token string) string {
    sum := sha256.Sum256([]byte(token))
    return base64.RawURLEncoding.EncodeToString(sum[:])
}
