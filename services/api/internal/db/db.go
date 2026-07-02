package db

import (
    "context"
    "database/sql"
    "fmt"
    "log/slog"
    "time"

    "github.com/uptrace/bun"
    "github.com/uptrace/bun/dialect/pgdialect"
    "github.com/uptrace/bun/driver/pgdriver"
    "github.com/uptrace/bun/extra/bundebug"

    "github.com/kwaabs/ntaa/services/api/internal/config"
)

// Open creates a *bun.DB ready for use. Caller is responsible for Close().
func Open(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*bun.DB, error) {
    sqldb := sql.OpenDB(pgdriver.NewConnector(
        pgdriver.WithDSN(cfg.DatabaseURL),
    ))

    sqldb.SetMaxOpenConns(cfg.DBMaxOpenConns)
    sqldb.SetMaxIdleConns(cfg.DBMaxIdleConns)
    sqldb.SetConnMaxLifetime(cfg.DBConnMaxLifetime)

    pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    if err := sqldb.PingContext(pingCtx); err != nil {
        _ = sqldb.Close()
        return nil, fmt.Errorf("ping postgres: %w", err)
    }

    db := bun.NewDB(sqldb, pgdialect.New())

    // Pretty SQL logs in dev only.
    if cfg.IsDev() {
        db.AddQueryHook(bundebug.NewQueryHook(
            bundebug.WithVerbose(false),
            bundebug.FromEnv("BUNDEBUG"),
        ))
    }

    logger.Info("database connected",
        slog.Int("max_open_conns", cfg.DBMaxOpenConns),
        slog.Int("max_idle_conns", cfg.DBMaxIdleConns),
    )
    return db, nil
}

// Ping is a cheap liveness check used by /readyz.
func Ping(ctx context.Context, db *bun.DB) error {
    c, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()
    return db.PingContext(c)
}
