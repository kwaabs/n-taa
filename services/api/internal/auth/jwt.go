package auth

import (
    "errors"
    "fmt"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
)

type Claims struct {
    UserID uuid.UUID `json:"uid"`
    Role   Role      `json:"role"`
    jwt.RegisteredClaims
}

type TokenIssuer struct {
    key    []byte
    ttl    time.Duration
    issuer string
}

func NewTokenIssuer(key []byte, ttl time.Duration, issuer string) *TokenIssuer {
    return &TokenIssuer{key: key, ttl: ttl, issuer: issuer}
}

func (ti *TokenIssuer) Issue(userID uuid.UUID, role Role) (string, time.Time, error) {
    now := time.Now()
    exp := now.Add(ti.ttl)
    claims := Claims{
        UserID: userID,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            IssuedAt:  jwt.NewNumericDate(now),
            ExpiresAt: jwt.NewNumericDate(exp),
            Issuer:    ti.issuer,
            Subject:   userID.String(),
        },
    }
    tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    s, err := tok.SignedString(ti.key)
    if err != nil {
        return "", time.Time{}, err
    }
    return s, exp, nil
}

func (ti *TokenIssuer) Parse(raw string) (*Claims, error) {
    parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return ti.key, nil
    })
    if err != nil {
        return nil, err
    }
    claims, ok := parsed.Claims.(*Claims)
    if !ok || !parsed.Valid {
        return nil, errors.New("invalid token")
    }
    return claims, nil
}
