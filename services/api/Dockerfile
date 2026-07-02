# ─── Build stage ─────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Cache module downloads across code changes
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.buildTime=$(date -u +%Y%m%d-%H%M%S)" \
    -o /out/api ./cmd/server

# ─── Runtime stage ───────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl && \
    adduser -D -u 10001 app

WORKDIR /app
COPY --from=builder /out/api /app/api

USER app
EXPOSE 5442

# The API reads DATABASE_URL, JWT_SIGNING_KEY, etc. from env.
# Provide them via docker-compose or `docker run -e`.
ENTRYPOINT ["/app/api"]
