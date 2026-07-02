package auth

import (
    "context"
    "database/sql"
    "errors"
    "time"

    "github.com/google/uuid"
    "github.com/uptrace/bun"
)

type Repo struct{ db *bun.DB }

func NewRepo(db *bun.DB) *Repo { return &Repo{db: db} }

// Users

func (r *Repo) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
    u := new(User)
    err := r.db.NewSelect().Model(u).Where("id = ?", id).Scan(ctx)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return u, nil
}

func (r *Repo) GetUserByEmail(ctx context.Context, email string) (*User, error) {
    u := new(User)
    err := r.db.NewSelect().Model(u).Where("email = ?", email).Scan(ctx)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return u, nil
}

// Identities

func (r *Repo) GetLocalIdentity(ctx context.Context, email string) (*Identity, error) {
    i := new(Identity)
    err := r.db.NewSelect().Model(i).
        Where("provider = ? AND subject = ?", ProviderLocal, email).
        Scan(ctx)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return i, nil
}

// Refresh tokens

func (r *Repo) InsertRefreshToken(ctx context.Context, rt *RefreshToken) error {
    _, err := r.db.NewInsert().Model(rt).Returning("*").Exec(ctx)
    return err
}

func (r *Repo) GetRefreshByHash(ctx context.Context, hash string) (*RefreshToken, error) {
    rt := new(RefreshToken)
    err := r.db.NewSelect().Model(rt).Where("token_hash = ?", hash).Scan(ctx)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return rt, nil
}

func (r *Repo) RevokeRefresh(ctx context.Context, id uuid.UUID) error {
    now := time.Now()
    _, err := r.db.NewUpdate().Model((*RefreshToken)(nil)).
        Set("revoked_at = ?", now).
        Where("id = ? AND revoked_at IS NULL", id).
        Exec(ctx)
    return err
}
