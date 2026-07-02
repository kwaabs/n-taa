package features

import "github.com/google/uuid"

type uuidLike = uuid.UUID

func uuidFromString(s string) (uuidLike, error) {
    return uuid.Parse(s)
}
