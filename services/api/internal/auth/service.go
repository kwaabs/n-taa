package auth

import (
    "context"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "errors"
    "time"
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
}

func NewService(repo *Repo, access *TokenIssuer, refreshTTL time.Duration) *Service {
    return &Service{repo: repo, access: access, refreshTTL: refreshTTL}
}

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
    return s.issue(ctx, u)
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
    return s.issue(ctx, u)
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

func (s *Service) issue(ctx context.Context, u *User) (*LoginResult, error) {
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
