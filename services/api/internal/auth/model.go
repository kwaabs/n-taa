package auth

import (
    "time"

    "github.com/google/uuid"
    "github.com/uptrace/bun"
)

type Role string

const (
    RoleSuperuser Role = "superuser"
    RoleEditor    Role = "editor"
    RoleViewer    Role = "viewer"
)

type Provider string

const (
    ProviderLocal  Provider = "local"
    ProviderAzure  Provider = "azure"
    ProviderGoogle Provider = "google"
)

const (
    StatusActive   = "active"
    StatusDisabled = "disabled"
)

type User struct {
    bun.BaseModel `bun:"table:app.users,alias:u"`

    ID          uuid.UUID `bun:"id,pk,type:uuid,default:gen_random_uuid()"`
    Email       string    `bun:"email,notnull"`
    DisplayName string    `bun:"display_name,notnull"`
    Role        Role      `bun:"role,notnull"`
    Status      string    `bun:"status,notnull"`
    CreatedAt   time.Time `bun:"created_at,notnull,default:now()"`
    UpdatedAt   time.Time `bun:"updated_at,notnull,default:now()"`
}

type Identity struct {
    bun.BaseModel `bun:"table:app.identities,alias:i"`

    ID           uuid.UUID `bun:"id,pk,type:uuid,default:gen_random_uuid()"`
    UserID       uuid.UUID `bun:"user_id,notnull,type:uuid"`
    Provider     Provider  `bun:"provider,notnull"`
    Subject      string    `bun:"subject,notnull"`
    PasswordHash *string   `bun:"password_hash"`
    CreatedAt    time.Time `bun:"created_at,notnull,default:now()"`
}

type RefreshToken struct {
    bun.BaseModel `bun:"table:app.refresh_tokens,alias:rt"`

    ID        uuid.UUID  `bun:"id,pk,type:uuid,default:gen_random_uuid()"`
    UserID    uuid.UUID  `bun:"user_id,notnull,type:uuid"`
    TokenHash string     `bun:"token_hash,notnull"`
    ExpiresAt time.Time  `bun:"expires_at,notnull"`
    RevokedAt *time.Time `bun:"revoked_at"`
    CreatedAt time.Time  `bun:"created_at,notnull,default:now()"`
}
