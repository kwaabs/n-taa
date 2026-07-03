package azure

import (
    "errors"
    "os"
    "strings"
)

// Config holds all Azure AD OAuth2 configuration.
type Config struct {
    TenantID     string
    ClientID     string
    ClientSecret string
    RedirectURI  string
    Scopes       []string
}

// LoadConfig reads Azure config from environment variables.
// Returns an error if required fields are missing.
func LoadConfig() (*Config, error) {
    cfg := &Config{
        TenantID:     os.Getenv("AZURE_TENANT_ID"),
        ClientID:     os.Getenv("AZURE_CLIENT_ID"),
        ClientSecret: os.Getenv("AZURE_CLIENT_SECRET"),
        RedirectURI:  os.Getenv("AZURE_REDIRECT_URI"),
    }

    scopesEnv := os.Getenv("AZURE_SCOPES")
    if scopesEnv == "" {
        scopesEnv = "openid profile email User.Read"
    }
    cfg.Scopes = strings.Fields(scopesEnv)

    if cfg.TenantID == "" {
        return nil, errors.New("AZURE_TENANT_ID is required")
    }
    if cfg.ClientID == "" {
        return nil, errors.New("AZURE_CLIENT_ID is required")
    }
    if cfg.ClientSecret == "" {
        return nil, errors.New("AZURE_CLIENT_SECRET is required")
    }
    if cfg.RedirectURI == "" {
        return nil, errors.New("AZURE_REDIRECT_URI is required")
    }

    return cfg, nil
}

// IsEnabled returns true if Azure auth is configured.
func IsEnabled() bool {
    _, err := LoadConfig()
    return err == nil
}

// AuthorityURL is the Microsoft identity platform endpoint for this tenant.
func (c *Config) AuthorityURL() string {
    return "https://login.microsoftonline.com/" + c.TenantID
}

// TokenEndpoint is where we exchange the auth code for tokens.
func (c *Config) TokenEndpoint() string {
    return c.AuthorityURL() + "/oauth2/v2.0/token"
}

// AuthorizeEndpoint is where we redirect the user to sign in.
func (c *Config) AuthorizeEndpoint() string {
    return c.AuthorityURL() + "/oauth2/v2.0/authorize"
}

// JWKSEndpoint is where we fetch public keys to validate ID tokens.
func (c *Config) JWKSEndpoint() string {
    return c.AuthorityURL() + "/discovery/v2.0/keys"
}
