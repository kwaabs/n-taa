package azure

import (
    "crypto/rsa"
    "encoding/base64"
    "errors"
    "math/big"
)

// rsaPublicKeyFromJWK constructs an rsa.PublicKey from a JWK.
func rsaPublicKeyFromJWK(k jwksKey) (*rsa.PublicKey, error) {
    if k.Kty != "RSA" {
        return nil, errors.New("only RSA keys are supported")
    }
    nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
    if err != nil {
        return nil, err
    }
    eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
    if err != nil {
        return nil, err
    }
    n := new(big.Int).SetBytes(nBytes)
    e := new(big.Int).SetBytes(eBytes)
    return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
}
