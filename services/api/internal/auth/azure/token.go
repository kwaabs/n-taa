package azure

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "strings"
    "sync"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

// IDTokenClaims — subset of Microsoft ID token claims we care about.
type IDTokenClaims struct {
    Oid       string `json:"oid"`
    Email     string `json:"email"`
    Preferred string `json:"preferred_username"`
    Name      string `json:"name"`
    TID       string `json:"tid"`
    jwt.RegisteredClaims
}

// TokenResponse — Azure token endpoint response.
type TokenResponse struct {
    AccessToken  string `json:"access_token"`
    IDToken      string `json:"id_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int    `json:"expires_in"`
    Scope        string `json:"scope"`
    TokenType    string `json:"token_type"`
}

// ─────────────────────────────────────────────────────────────
// JWKS cache
// ─────────────────────────────────────────────────────────────

type jwksKey struct {
    Kid string   `json:"kid"`
    Kty string   `json:"kty"`
    N   string   `json:"n"`
    E   string   `json:"e"`
    X5c []string `json:"x5c"`
}

type jwksResponse struct {
    Keys []jwksKey `json:"keys"`
}

var (
    jwksCache    *jwksResponse
    jwksCacheMu  sync.Mutex
    jwksCacheExp time.Time
    jwksCacheTTL = 6 * time.Hour
    httpClient   = &http.Client{Timeout: 10 * time.Second}
)

// fetchJWKS gets Microsoft's signing keys, cached.
func fetchJWKS(ctx context.Context, endpoint string) (*jwksResponse, error) {
    jwksCacheMu.Lock()
    defer jwksCacheMu.Unlock()

    if jwksCache != nil && time.Now().Before(jwksCacheExp) {
        return jwksCache, nil
    }

    req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
    if err != nil {
        return nil, err
    }
    resp, err := httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("jwks endpoint returned %d", resp.StatusCode)
    }

    var jwks jwksResponse
    if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
        return nil, err
    }
    jwksCache = &jwks
    jwksCacheExp = time.Now().Add(jwksCacheTTL)
    return &jwks, nil
}

// ExchangeCode swaps an authorization code for tokens.
func ExchangeCode(ctx context.Context, cfg *Config, code string) (*TokenResponse, error) {
    form := url.Values{}
    form.Set("client_id", cfg.ClientID)
    form.Set("client_secret", cfg.ClientSecret)
    form.Set("code", code)
    form.Set("redirect_uri", cfg.RedirectURI)
    form.Set("grant_type", "authorization_code")
    form.Set("scope", strings.Join(cfg.Scopes, " "))

    req, err := http.NewRequestWithContext(ctx, "POST", cfg.TokenEndpoint(),
        strings.NewReader(form.Encode()))
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

    resp, err := httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("token exchange failed: %w", err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("azure token endpoint returned %d: %s",
            resp.StatusCode, string(body))
    }

    var tokens TokenResponse
    if err := json.Unmarshal(body, &tokens); err != nil {
        return nil, fmt.Errorf("failed to parse token response: %w", err)
    }
    return &tokens, nil
}

// ValidateIDToken parses and validates an Azure ID token.
func ValidateIDToken(ctx context.Context, cfg *Config, idToken string) (*IDTokenClaims, error) {
    jwks, err := fetchJWKS(ctx, cfg.JWKSEndpoint())
    if err != nil {
        return nil, fmt.Errorf("fetch jwks: %w", err)
    }

    claims := &IDTokenClaims{}
    parsed, err := jwt.ParseWithClaims(idToken, claims, func(token *jwt.Token) (any, error) {
        if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        kid, _ := token.Header["kid"].(string)
        for _, k := range jwks.Keys {
            if k.Kid == kid {
                return rsaPublicKeyFromJWK(k)
            }
        }
        return nil, fmt.Errorf("unknown kid: %s", kid)
    }, jwt.WithAudience(cfg.ClientID),
        jwt.WithIssuer("https://login.microsoftonline.com/"+cfg.TenantID+"/v2.0"))

    if err != nil {
        return nil, fmt.Errorf("token validation failed: %w", err)
    }
    if !parsed.Valid {
        return nil, errors.New("invalid token")
    }

    if claims.Email == "" && claims.Preferred != "" {
        claims.Email = claims.Preferred
    }
    if claims.Email == "" {
        return nil, errors.New("no email claim in token")
    }
    if claims.Oid == "" {
        return nil, errors.New("no oid claim in token")
    }

    return claims, nil
}
