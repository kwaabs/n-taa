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

            // Azure AD OAuth2 (only mounted if AZURE_* env vars are set)
            if s.deps.AzureAuthHandler != nil {
                r.Route("/azure", func(r chi.Router) {
                    r.Get("/login", s.deps.AzureAuthHandler.LoginURL)
                    r.Post("/callback", s.deps.AzureAuthHandler.Callback)
                })
            }

            r.Group(func(r chi.Router) {
                r.Use(s.deps.AuthMW.RequireUser)
                r.Get("/me", s.deps.AuthHandler.Me)
            })
        })

        // Users — superuser only
        r.Route("/users", func(r chi.Router) {
            r.Use(s.deps.AuthMW.RequireUser)
            r.Use(s.deps.AuthMW.RequireRole(auth.RoleSuperuser))

            r.Get("/", s.deps.AuthHandler.UsersList)
            r.Patch("/{id}", s.deps.AuthHandler.UsersUpdate)
            r.Patch("/{id}/approve", s.deps.AuthHandler.UsersApprove)
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
                    r.Patch("/{id}/permissions", s.deps.LayersHandler.UpdatePermissions)  // ← ADD
                })


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

                // Feeder trace (line features only)
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
