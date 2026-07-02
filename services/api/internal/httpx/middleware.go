package httpx

import (
    "log/slog"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5/middleware"
)

// RequestLogger emits a structured log line per request.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

            defer func() {
                logger.Info("http",
                    slog.String("method", r.Method),
                    slog.String("path", r.URL.Path),
                    slog.Int("status", ww.Status()),
                    slog.Int("bytes", ww.BytesWritten()),
                    slog.Duration("took", time.Since(start)),
                    slog.String("req_id", middleware.GetReqID(r.Context())),
                    slog.String("remote", r.RemoteAddr),
                )
            }()

            next.ServeHTTP(ww, r)
        })
    }
}
