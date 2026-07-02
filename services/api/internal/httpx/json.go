package httpx

import (
    "encoding/json"
    "net/http"
)

// JSON writes v as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(status)
    if v == nil {
        return
    }
    _ = json.NewEncoder(w).Encode(v)
}

// DecodeJSON decodes a JSON body into v. Rejects unknown fields.
func DecodeJSON(r *http.Request, v any) error {
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields()
    return dec.Decode(v)
}
