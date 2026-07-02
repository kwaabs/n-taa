package httpx

import (
    "errors"
    "log/slog"
    "net/http"
)

// APIError is the JSON shape returned for every failure.
type APIError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

type errorEnvelope struct {
    Error APIError `json:"error"`
}

// Common error codes. Keep this list small and meaningful.
const (
    CodeBadRequest   = "bad_request"
    CodeUnauthorized = "unauthorized"
    CodeForbidden    = "forbidden"
    CodeNotFound     = "not_found"
    CodeConflict     = "conflict"
    CodeInternal     = "internal"
)

// Error writes an error envelope with the given status + code + message.
func Error(w http.ResponseWriter, status int, code, message string) {
    JSON(w, status, errorEnvelope{Error: APIError{Code: code, Message: message}})
}

// BadRequest, Unauthorized, NotFound, etc. — sugar.
func BadRequest(w http.ResponseWriter, msg string)   { Error(w, http.StatusBadRequest, CodeBadRequest, msg) }
func Unauthorized(w http.ResponseWriter, msg string) { Error(w, http.StatusUnauthorized, CodeUnauthorized, msg) }
func Forbidden(w http.ResponseWriter, msg string)    { Error(w, http.StatusForbidden, CodeForbidden, msg) }
func NotFound(w http.ResponseWriter, msg string)     { Error(w, http.StatusNotFound, CodeNotFound, msg) }
func Conflict(w http.ResponseWriter, msg string)     { Error(w, http.StatusConflict, CodeConflict, msg) }

// Internal logs the underlying error and returns a sanitized 500.
func Internal(w http.ResponseWriter, logger *slog.Logger, err error) {
    if logger != nil {
        logger.Error("internal server error", slog.String("err", err.Error()))
    }
    Error(w, http.StatusInternalServerError, CodeInternal, "internal server error")
}

// Sentinel errors handlers can return up the stack if they prefer.
var (
    ErrBadRequest   = errors.New("bad request")
    ErrUnauthorized = errors.New("unauthorized")
    ErrForbidden    = errors.New("forbidden")
    ErrNotFound     = errors.New("not found")
    ErrConflict     = errors.New("conflict")
)
