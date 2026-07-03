package main

import (
    "context"
    "log/slog"
    "os"
    "os/signal"
    "syscall"

    "github.com/kwaabs/ntaa/services/api/internal/auth"
    "github.com/kwaabs/ntaa/services/api/internal/config"
    "github.com/kwaabs/ntaa/services/api/internal/db"
    "github.com/kwaabs/ntaa/services/api/internal/layers"
    "github.com/kwaabs/ntaa/services/api/internal/server"
    "github.com/kwaabs/ntaa/services/api/internal/features"
    "github.com/kwaabs/ntaa/services/api/internal/auth/azure"

)

func main() {
    if err := run(); err != nil {
        slog.New(slog.NewTextHandler(os.Stderr, nil)).
            Error("fatal", slog.String("err", err.Error()))
        os.Exit(1)
    }
}

func run() error {
    cfg, err := config.Load()
    if err != nil {
        return err
    }
    logger := newLogger(cfg)

    ctx, stop := signal.NotifyContext(context.Background(),
        os.Interrupt, syscall.SIGTERM)
    defer stop()

    database, err := db.Open(ctx, cfg, logger)
    if err != nil {
        return err
    }
    defer func() {
        if err := database.Close(); err != nil {
            logger.Warn("db close", slog.String("err", err.Error()))
        }
    }()

    // Seed superuser (idempotent).
    if err := auth.SeedSuperuser(ctx, database, logger, auth.SeedConfig{
        Email:       cfg.SuperuserEmail,
        Password:    cfg.SuperuserPassword,
        DisplayName: cfg.SuperuserName,
    }); err != nil {
        return err
    }

    // Auth wiring
    authRepo := auth.NewRepo(database)
    accessIssuer := auth.NewTokenIssuer(
        []byte(cfg.JWTSigningKey),
        cfg.JWTAccessTTL,
        cfg.JWTIssuer,
    )
    authSvc := auth.NewService(authRepo, accessIssuer, cfg.JWTRefreshTTL,os.Getenv("SUPERUSER_EMAIL"))
    authHandler := auth.NewHandler(authSvc, logger, cfg.CookieDomain, cfg.CookieSecure)
    azureHandler := azure.NewHandler(database, authSvc, logger)
    authMW := auth.NewMiddleware(accessIssuer, authRepo)

    // Layers wiring
    layersRepo := layers.NewRepo(database)
    layersProbe := db.NewProbe(database)
    layersSvc := layers.NewService(layersRepo, layersProbe)
    layersHandler := layers.NewHandler(layersSvc, logger)

    // Features wiring
    featuresRepo := features.NewRepo(database)
    featuresSvc := features.NewService(layersSvc, featuresRepo)
    featuresHandler := features.NewHandler(featuresSvc, layersSvc, logger)

    srv := server.New(&server.Deps{
        Config:          cfg,
        Logger:          logger,
        DB:              database,
        AuthHandler:     authHandler,
        AuthMW:          authMW,
        LayersHandler:   layersHandler,
        FeaturesHandler: featuresHandler,

        AzureAuthHandler: azureHandler,   // ← ADD THIS

    })
    return srv.Start(ctx)
}

func newLogger(cfg *config.Config) *slog.Logger {
    opts := &slog.HandlerOptions{Level: cfg.LogLevel}
    var h slog.Handler
    if cfg.IsDev() {
        h = slog.NewTextHandler(os.Stdout, opts)
    } else {
        h = slog.NewJSONHandler(os.Stdout, opts)
    }
    return slog.New(h)
}
