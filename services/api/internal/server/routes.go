package server

import (
    "net/http"

    "github.com/go-chi/chi/v5"

    "github.com/kwaabs/ntaa/services/api/internal/auth"
    "github.com/kwaabs/ntaa/services/api/internal/db"
    "github.com/kwaabs/ntaa/services/api/internal/httpx"
)

func (s *Server) mountRoutes() {
    r := s.router

    r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
        httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
    })

    r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
        if err := db.Ping(req.Context(), s.deps.DB); err != nil {
            httpx.Error(w, http.StatusServiceUnavailable, "not_ready", err.Error())
            return
        }
        httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
    })

    r.Route("/api/v1", func(r chi.Router) {
        r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) {
            httpx.JSON(w, http.StatusOK, map[string]string{"pong": "true"})
        })

        // Auth
        r.Route("/auth", func(r chi.Router) {
            r.Post("/login", s.deps.AuthHandler.Login)
            r.Post("/refresh", s.deps.AuthHandler.Refresh)
            r.Post("/logout", s.deps.AuthHandler.Logout)

            r.Group(func(r chi.Router) {
                r.Use(s.deps.AuthMW.RequireUser)
                r.Get("/me", s.deps.AuthHandler.Me)
            })
        })

        // Layers (auth required for all endpoints)
        r.Route("/layers", func(r chi.Router) {
            r.Use(s.deps.AuthMW.RequireUser)

            r.Get("/", s.deps.LayersHandler.List)
            r.Get("/{id}", s.deps.LayersHandler.Get)

            // Layer schema (fields + types + distinct values)
            r.Get("/{layerId}/schema", s.deps.FeaturesHandler.Schema)

            // Whole-layer export (CSV / XLSX / GeoJSON)
            r.Post("/{layerId}/export.{fmt}", s.deps.FeaturesHandler.ExportLayer)

            r.Group(func(r chi.Router) {
                r.Use(s.deps.AuthMW.RequireRole(auth.RoleSuperuser))
                r.Post("/", s.deps.LayersHandler.Create)
                r.Patch("/{id}", s.deps.LayersHandler.Update)
                r.Delete("/{id}", s.deps.LayersHandler.Delete)
            })

            // Features under each layer
            r.Route("/{layerId}/features", func(r chi.Router) {
                r.Get("/count", s.deps.FeaturesHandler.Count)
                r.Get("/", s.deps.FeaturesHandler.List)
                r.Get("/{ogcFid}", s.deps.FeaturesHandler.Get)

                r.Post("/query", s.deps.FeaturesHandler.Query)
                r.Post("/count", s.deps.FeaturesHandler.CountWithin)

                // Spatial export (CSV / XLSX / GeoJSON)
                r.Post("/export.{fmt}", s.deps.FeaturesHandler.Export)

                r.Post("/{ogcFid}/trace", s.deps.FeaturesHandler.TraceFeeder)

                r.Group(func(r chi.Router) {
                    r.Use(s.deps.AuthMW.RequireRole(auth.RoleEditor, auth.RoleSuperuser))
                    r.Post("/", s.deps.FeaturesHandler.Create)
                    r.Patch("/{ogcFid}", s.deps.FeaturesHandler.Update)
                    r.Delete("/{ogcFid}", s.deps.FeaturesHandler.Delete)
                })
            })
        })
    })
}
