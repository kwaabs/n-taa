package config

import (
    "fmt"
    "log/slog"
    "os"
    "strconv"
    "strings"
    "time"

    "github.com/joho/godotenv"
)

type Env string

const (
    EnvDevelopment Env = "development"
    EnvProduction  Env = "production"
)

type Config struct {
    Env      Env
    Host     string
    Port     int
    LogLevel slog.Level

    DatabaseURL       string
    DBMaxOpenConns    int
    DBMaxIdleConns    int
    DBConnMaxLifetime time.Duration

    CORSAllowedOrigins []string

    MartinBaseURL string // <-- ADD THIS

    JWTSigningKey string
    JWTAccessTTL  time.Duration
    JWTRefreshTTL time.Duration
    JWTIssuer     string

    SuperuserEmail    string
    SuperuserPassword string
    SuperuserName     string

    CookieDomain string
    CookieSecure bool
}

func Load() (*Config, error) {
    _ = godotenv.Load()

    cfg := &Config{
        Env:               Env(getEnv("API_ENV", "development")),
        Host:              getEnv("API_HOST", "0.0.0.0"),
        Port:              getEnvInt("API_PORT", 5442),
        LogLevel:          parseLogLevel(getEnv("API_LOG_LEVEL", "info")),
        DatabaseURL:       getEnv("DATABASE_URL", ""),
        DBMaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 20),
        DBMaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
        DBConnMaxLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", 30*time.Minute),

        CORSAllowedOrigins: splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),

        MartinBaseURL: getEnv("MARTIN_BASE_URL", "http://localhost:5441"),   // <-- ADD THIS

        JWTSigningKey: getEnv("JWT_SIGNING_KEY", ""),
        JWTAccessTTL:  getEnvDuration("JWT_ACCESS_TTL", 15*time.Minute),
        JWTRefreshTTL: getEnvDuration("JWT_REFRESH_TTL", 720*time.Hour),
        JWTIssuer:     getEnv("JWT_ISSUER", "geo-app"),

        SuperuserEmail:    getEnv("SUPERUSER_EMAIL", ""),
        SuperuserPassword: getEnv("SUPERUSER_PASSWORD", ""),
        SuperuserName:     getEnv("SUPERUSER_NAME", ""),

        CookieDomain: getEnv("COOKIE_DOMAIN", ""),
        CookieSecure: getEnvBool("COOKIE_SECURE", false),
    }

    if err := cfg.validate(); err != nil {
        return nil, err
    }
    return cfg, nil
}

func (c *Config) validate() error {
    if c.DatabaseURL == "" {
        return fmt.Errorf("DATABASE_URL is required")
    }
    if c.Port <= 0 || c.Port > 65535 {
        return fmt.Errorf("API_PORT must be 1..65535, got %d", c.Port)
    }
    if c.Env != EnvDevelopment && c.Env != EnvProduction {
        return fmt.Errorf("API_ENV must be development or production, got %q", c.Env)
    }
    if len(c.JWTSigningKey) < 32 {
        return fmt.Errorf("JWT_SIGNING_KEY must be at least 32 chars")
    }
    return nil
}

func (c *Config) Addr() string { return fmt.Sprintf("%s:%d", c.Host, c.Port) }
func (c *Config) IsDev() bool  { return c.Env == EnvDevelopment }

// helpers unchanged, plus one addition:
func getEnv(key, fallback string) string {
    if v, ok := os.LookupEnv(key); ok && v != "" {
        return v
    }
    return fallback
}

func getEnvInt(key string, fallback int) int {
    if v, ok := os.LookupEnv(key); ok && v != "" {
        if n, err := strconv.Atoi(v); err == nil {
            return n
        }
    }
    return fallback
}

func getEnvBool(key string, fallback bool) bool {
    if v, ok := os.LookupEnv(key); ok && v != "" {
        switch strings.ToLower(v) {
        case "1", "true", "yes", "on":
            return true
        case "0", "false", "no", "off":
            return false
        }
    }
    return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
    if v, ok := os.LookupEnv(key); ok && v != "" {
        if d, err := time.ParseDuration(v); err == nil {
            return d
        }
    }
    return fallback
}

func splitCSV(s string) []string {
    if s == "" {
        return nil
    }
    parts := strings.Split(s, ",")
    out := make([]string, 0, len(parts))
    for _, p := range parts {
        if t := strings.TrimSpace(p); t != "" {
            out = append(out, t)
        }
    }
    return out
}

func parseLogLevel(s string) slog.Level {
    switch strings.ToLower(s) {
    case "debug":
        return slog.LevelDebug
    case "warn":
        return slog.LevelWarn
    case "error":
        return slog.LevelError
    default:
        return slog.LevelInfo
    }
}
