package auth

import (
    "context"
    "fmt"
    "log/slog"

    "github.com/uptrace/bun"
)

type SeedConfig struct {
    Email       string
    Password    string
    DisplayName string
}

// SeedSuperuser is idempotent. Safe to call every boot.
// - Missing email/password: skip with a warning.
// - Email exists but not superuser/active: promote.
// - Email doesn't exist: create user + local identity in a tx.
// Password is NEVER updated on re-runs; use a manual UPDATE if needed.
func SeedSuperuser(ctx context.Context, db *bun.DB, logger *slog.Logger, cfg SeedConfig) error {
    if cfg.Email == "" || cfg.Password == "" {
        logger.Warn("superuser seed skipped: SUPERUSER_EMAIL or SUPERUSER_PASSWORD not set")
        return nil
    }
    repo := NewRepo(db)

    existing, err := repo.GetUserByEmail(ctx, cfg.Email)
    if err != nil {
        return fmt.Errorf("check superuser: %w", err)
    }
    if existing != nil {
        if existing.Role != RoleSuperuser || existing.Status != StatusActive {
            _, err := db.NewUpdate().Model((*User)(nil)).
                Set("role = ?", RoleSuperuser).
                Set("status = ?", StatusActive).
                Where("id = ?", existing.ID).
                Exec(ctx)
            if err != nil {
                return fmt.Errorf("promote superuser: %w", err)
            }
            logger.Info("superuser promoted", slog.String("email", cfg.Email))
        } else {
            logger.Info("superuser already present", slog.String("email", cfg.Email))
        }
        return nil
    }

    hash, err := HashPassword(cfg.Password)
    if err != nil {
        return fmt.Errorf("hash superuser password: %w", err)
    }
    displayName := cfg.DisplayName
    if displayName == "" {
        displayName = "Super Admin"
    }

    err = db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
        u := &User{
            Email:       cfg.Email,
            DisplayName: displayName,
            Role:        RoleSuperuser,
            Status:      StatusActive,
        }
        if _, err := tx.NewInsert().Model(u).Returning("*").Exec(ctx); err != nil {
            return err
        }
        id := &Identity{
            UserID:       u.ID,
            Provider:     ProviderLocal,
            Subject:      cfg.Email,
            PasswordHash: &hash,
        }
        if _, err := tx.NewInsert().Model(id).Exec(ctx); err != nil {
            return err
        }
        return nil
    })
    if err != nil {
        return fmt.Errorf("seed superuser: %w", err)
    }
    logger.Info("superuser seeded", slog.String("email", cfg.Email))
    return nil
}
