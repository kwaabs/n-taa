# ─── Build stage ─────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /build

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .

# Build-time env — set to empty for same-origin API proxy (nginx routes /api → api container)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN bun run build

# ─── Runtime stage ───────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default config, add ours
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80

# Health-check aware startup
CMD ["nginx", "-g", "daemon off;"]
