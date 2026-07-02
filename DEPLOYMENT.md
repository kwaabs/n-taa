# n-taa Deployment Guide

Complete guide to deploying the n-taa geospatial platform in production.

**Stack:** PostgreSQL/PostGIS · Martin tile server · Go API · React frontend (nginx)

---

## Table of Contents

1. Prerequisites
2. #2-initial-setup
3. First-Time Deployment
4. #4-loading-your-data
5. [Verification](#5-verification)
6. Common Operations
7. #7-updates--rebuilds
8. [ackup & Restore
9. #9-troubleshooting
10. [roduction Hardening (HTTPS, Secrets)
11. #11-security-checklist

---

## 1. Prerequisites

### On the deployment machine

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS**      | Linux (Ubuntu 22.04+ / Debian 12+) | Ubuntu 24.04 LTS |
| **Docker**  | 24.0+ | Latest stable |
| **Docker Compose** | v2 (as `docker compose`) | Latest |
| **RAM**     | 4 GB | 8 GB+ |
| **Disk**    | 20 GB free | 100 GB+ for real data |
| **Ports**   | 80 (web), 5441 (tiles) | Same, behind reverse proxy |

Verify:

```bash
docker --version           # Docker version 24.x+
docker compose version     # v2.x
```

### On your local machine (for setup)

- `git`
- `openssl` (for generating JWT signing key)
- A text editor for `.env.prod`

---

## 2. Initial Setup

### 2.1 Clone the repository

```bash
git clone <your-repo-url> n-taa
cd n-taa
```

### 2.2 Create the production env file

```bash
cp infra/.env.prod.example infra/.env.prod
```

### 2.3 Generate a JWT signing key

**This must be a strong random string ≥ 32 characters.** Use:

```bash
openssl rand -base64 48
```

Copy the output. You'll paste it into `.env.prod` as `JWT_SIGNING_KEY`.

### 2.4 Edit `infra/.env.prod`

Open in your editor and set **at minimum**:

```bash
# Strong random passwords
POSTGRES_PASSWORD=<generate a strong password>
APP_DB_PASSWORD=<generate a different strong password>

# Update DATABASE_URL to match APP_DB_PASSWORD
DATABASE_URL=postgres://geo_app:<same as APP_DB_PASSWORD>@postgres:5432/geo?sslmode=disable

# The JWT key from step 2.3
JWT_SIGNING_KEY=<paste the openssl output>

# Your first superuser
SUPERUSER_EMAIL=admin@your-domain.com
SUPERUSER_PASSWORD=<strong initial password — change after first login>
SUPERUSER_NAME=Administrator

# Public URL(s) that will call this API
CORS_ALLOWED_ORIGINS=https://your-domain.com

# For HTTPS deployments:
COOKIE_DOMAIN=.your-domain.com
COOKIE_SECURE=true
```

> ⚠ **Never commit `.env.prod` to git.** Add it to `.gitignore` if it's not already there.

### 2.5 Add `.env.prod` to `.gitignore`

```bash
grep -qxF 'infra/.env.prod' .gitignore || echo 'infra/.env.prod' >> .gitignore
```

---

## 3. First-Time Deployment

### 3.1 Build and start

```bash
make prod-up
```

This will:
1. Build the API image (~1-2 min first time)
2. Build the web image (~1-2 min first time)
3. Pull Postgres and Martin images
4. Start all four containers
5. Run `bootstrap.sql` to create `app.*` and `dbo.*` schemas
6. Seed the superuser account

**First build is slow (~3-5 min).** Subsequent restarts are seconds.

### 3.2 Watch startup

In a second terminal:

```bash
make prod-logs
```

Look for these lines (in order):

```text
geo-postgres  | LOG: database system is ready to accept connections
geo-martin    | INFO martin: 0 tables and 0 functions found
geo-api       | INFO msg="database connected"
geo-api       | INFO msg="superuser seeded"      # or "already present"
geo-api       | INFO msg="api listening" addr=0.0.0.0:5442
geo-web       | (nginx access logs — no errors)
```

If any container keeps restarting, jump to [Troubleshooting](#9-troubleshooting).

### 3.3 Verify container health

```bash
make prod-ps
```

All four services should show `Up` and `(healthy)`:

```text
NAME           STATUS
geo-postgres   Up 30 seconds (healthy)
geo-martin     Up 25 seconds
geo-api        Up 20 seconds (healthy)
geo-web        Up 15 seconds (healthy)
```

### 3.4 First HTTP checks

```bash
curl -fsS http://localhost/healthz          # → ok
curl -fsS http://localhost/api/v1/ping      # → {"pong":"true"}
```

### 3.5 First login

Open **`http://localhost`** (or your domain if DNS is pointed).

Log in with `SUPERUSER_EMAIL` + `SUPERUSER_PASSWORD` from `.env.prod`.

At this point the app runs — but no dbo data is loaded yet. The Layers panel will be empty.

---

## 4. Loading Your Data

### 4.1 Import your dbo tables

Load your utility asset data into the `dbo` schema. Two common approaches:

**Option A — pg_restore from a dump file:**

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec -T \
  -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  pg_restore -U supabase_admin -d geo --schema=dbo < /path/to/dump.sql
```

**Option B — ogr2ogr from shapefiles:**

```bash
# Get the postgres container's IP
POSTGRES_IP=$(docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec postgres hostname -i)

ogr2ogr -f PostgreSQL \
  "PG:host=$POSTGRES_IP port=5432 dbname=geo user=supabase_admin password=$POSTGRES_PASSWORD" \
  my_layer.shp \
  -nln dbo_my_layer_evw \
  -lco SCHEMA=dbo \
  -lco GEOMETRY_NAME=the_geom \
  -lco FID=ogc_fid \
  -lco FID64=YES \
  -nlt PROMOTE_TO_MULTI \
  -t_srs EPSG:4326
```

Repeat for each layer. Table names should follow the `dbo_<name>_evw` convention if you want the auto-seed to name them cleanly.

### 4.2 Verify data landed

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec \
  -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  psql -U supabase_admin -d geo -c "\dt dbo.*"
```

You should see your importe* tables listed.

### 4.3 Run schem* h*rdening

Adds PRIMARY KEYs on `ogc*fid` and GIST indexes on `the_geom* for every dbo geometry table:

``*bash
docker compose --env-file inf*a/.env.prod -f infra/docker-compos*.prod.yaml exec -T \
  -e PGPASSWO*D=$POSTGRES_PASSWORD postgres \
  *sql -U supabase_admin -d geo -v ON*ERROR_STOP=1 \
  < infra/postgres/*bo_hardening.sql
```

Look for `NO*ICE: PK added: dbo.<table>` lines *or each table.

### 4.4 Seed app.*ayers

Populates the `app.layers` *egistry with a row per dbo table:
*```bash
docker compose --env-file *nfra/.env*prod -f infra/docker-compose.prod.*aml exec -T \
  -e PGPASSWORD=$POS*GRES_PASSWORD postgres \
  psql -U*supab*se_admin -d geo -v ON_ERROR_STOP=1*\
  < infra/postgres/dbo_layers_se*d.sql
```

### 4.5 Apply layer sty*ing

Sets voltage-based colors and*icon assignments:

```bash
docker *ompose --env-file infra/.env.prod *f infra/docker-*ompose.prod.yaml exec -T \
  -e PG*ASSWORD=$POSTGRES_PASSWORD postgre* \
  psql -U supabase_admin -d geo*-v *N_ERROR_STOP=1 \
  < infra/postgre*/dbo_layers_style_seed.sql
```

##* 4.6 (Optional) Create ECG*regions view

If you have `dbo.dbo*ecg` districts and want dissolved-*y-region polygons:

```bash
# Run *he ecg_regions creation SQL — see *epo for*the exact file
docker compose --en*-file infra/.env.prod -f infra/doc*er-compose.prod.yaml exec -T \
  -* PGPASSWOR*=$POSTGRES_PASSWORD postgres \
  p*ql -U supabase_admin -d geo -v ON_*RROR_STOP=1 \
  < infra/postgres/d*o_ecg_regions.sql
```

### 4.7 Upd*te tile URLs for your domain

The *PI sets `tile_url* in `app.layers` using `localhost:*441` by default. In production, up*ate to*your public Martin URL:

```bash
d*cker compose --env-file infra/.env*prod -f infra/docker-compose.prod.*aml exec \
  -e P*PASSWORD=$POSTGRES_PASSWORD postgr*s \
  psql -U supabase_admin -d ge* -c \
  "UPDATE app.layers SET til**url = REPLACE(tile_url, 'localhost*5441', 'tiles.your-domain.com');"
*``

If Martin is behind HTTPS,*also do:

```bash
docker compose -*env-file infra/.env.prod -f infra/*ocker-compose.prod.yaml exec \
  -* PGPASSWORD=$POSTGRES*PASSWORD postgres \
  psql -U supa*ase_admin -d geo -c \
  "UPDATE ap*.layers SET tile_url = REPLACE(til*_url, 'http://', 'https://');"
```*
### 4.8 Restart Martin to discove* new tables

```bash
docker compos* --env-file infra/.env.prod -f inf*a/docker-compose.prod.yaml restart*martin
```

Wait ~10 seconds, then*verify:

```bash
curl -fsS http://localhost:5441/catalog | jq '.ti*es | keys | length'
```

Should re*urn the number of dbo geometry tab*es you loaded.

---

## 5. Verific*tion

### 5.1 Full smoke test

Ref*esh your browser at `http://localh*st` (or your domain):

- [ ] Layer* panel shows all your tables
- [ ]*Toggling a layer renders on the ma*
- [ ] Clicking a feature opens th* drawer with attributes
- [ ] Sear*h panel works (type region → equal* → Ashan*i → Search)
- [ ] Table appears wi*h results
- [ ] CSV /*Excel / GeoJSON exports download
-*[ ] Print → PDF export produces a *ile
- [ ] Meas*re distance/area works
- [ ] Right*click on a feature → buffer works
* [ ] Feeder trace works on O*/UG conductor layers

If any step *ails, see [Troubleshooting](#9-tro*bleshooting*.

### 5.2 Log check

```bash
make*prod-logs
```

Look for **red *RROR lines**. Warnings are usually*fine; errors need investigating*

---

## 6. Common Operations

##* View logs

```bash
# All services* follow m*de
make prod-logs

# Just one serv*ce
docker compose --env-file infra*.env.prod -f infra/docker-compose.*rod.yaml logs -f api
```

### Rest*rt a single service

```bash
docke* compose --env-file infra/.env.pro* -f infra/docker-compose.prod.yaml*restart api
```

### Stop everythi*g (data preserved)

```bash
make p*od-down
```

### Stop everything A*D wipe*the database

> ⚠ **Destroys all d*ta. Only use in d*v.**

```bash
make prod-nuke
```

*## Get a psql shell as admin

```b*sh
docker compose --env-file infra*.env.prod -f infra/docker-compose.*rod.yaml exec \
  -e PGPASSWORD=$P*STGRES_PASSWORD postgres \
  psql *U supabase_admin -d geo
```

### C*ange a user's password

```sql
-- *n psql
UPDATE app.identities
SET p*ssword_hash = crypt('new-strong-pa*sword', gen_salt('bf'))
WHERE prov*der = 'local' AND subject = 'admin*your-domain.com';
```

---

## 7. *pdates & Rebuilds

### Update code*and redeploy

```bash
cd n*taa
git pull

# Rebuild only what *hanged
make prod-up
```

This rebu*lds both images and rolls contain*rs. Zero-downtime is not guarantee* with plain compose — for that* use a reverse proxy with rolling *pdates.

### Rebuild without cache*(if upd*tes seem stuck)

```bash
docker co*pose --env-file infra/.env.prod -f*infra/docker-compose.prod.yaml bui*d --no-cache
make prod-up
```

###*Update database schema (migrations*

If you introduce a new SQL mig*ation:

```bash
docker compose --e*v-file infra/.env.prod -f infra/do*ker-compose.prod.yaml exec -T \
  *e PGPASSWORD=$POSTGRES_PASSWORD po*tgres \
  psql -U supabase_admin -* geo -v ON_ERROR_STOP=1 < path/to/*igration.sql*```

---

## 8. Backup & Restore

*## Manual backup

```bash
# Dump f*ll database
docker compose --env-f*le infra/.env.prod -f infra*docker-compose.prod.yaml exec -T \*  -e PGPASSWORD=$POSTGRES_PASSWORD*postgres \
  pg_dump -U supabase_a*min*-Fc -d geo > backup-$(date +%Y%m%d*.dump
```

### Automated nightly b*ckup (*ron)

Add to your host's crontab:
*```cron
0 2 * * **cd /path/to/n-taa && docker compos* --env-file infra/.env.prod -f inf*a/docker-compose.prod.yaml exec -T*-e PGPASSW*RD=$POSTGRES_PASSWORD postgres pg_*ump -U supabase_admin -Fc -d geo >*/backups/n-taa-$(date +\*Y\%m\%d).dump && find /backups -name 'n-taa-*.dump' -mtime +30 -delete
```

This backs up nightly at 2 AM and keeps 30 days of history. For real production, ship the dumps to S3 or offsite storage.

### Restore from backup

```bash
# 1. Stop services that touch the DB
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml stop api martin web

# 2. Drop and recreate the database
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec \
  -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  psql -U supabase_admin -d postgres -c "DROP DATABASE geo;"

docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec \
  -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  psql -U supabase_admin -d postgres -c "CREATE DATABASE geo OWNER supabase_admin;"

# 3. Restore
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml exec -T \
  -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  pg_restore -U supabase_admin -d geo < backup-YYYYMMDD.dump

# 4. Restart services
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml start api martin web
```

---

## 9. Troubleshooting

### API keeps restarting

Check logs:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml logs api
```

**Common causes:**

| Error | Fix |
|-------|-----|
| `DATABASE_URL is required` | `.env.prod` missing or wrong `DATABASE_URL` |
| `password authentication failed` | `APP_DB_PASSWORD` in DATABASE_URL doesn't match `APP_DB_PASSWORD` env |
| `JWT_SIGNING_KEY must be at least 32 chars` | Regenerate with `openssl rand -base64 48` |
| `ping timeout` to postgres | Postgres hasn't finished initializing; wait or check its logs |

### Frontend loads but API calls fail (CORS / 401)

- Confirm `CORS_ALLOWED_ORIGINS` in `.env.prod` matches the URL in the browser exactly (protocol + domain)
- Check the browser console for the actual error
- Verify the API is reachable: `curl -fsS http://localhost/api/v1/ping`

### Layers panel is empty

- Confirm dbo tables exist: `\dt dbo.*` in psql
- Confirm hardening ran: `SELECT count(*) FROM information_schema.table_constraints WHERE table_schema='dbo' AND constraint_type='PRIMARY KEY';` should match your dbo table count
- Confirm layer seed ran: `SELECT count(*) FROM app.layers;`

### Tiles don't render

- Check `curl -fsS http://localhost:5441/catalog` shows sources
- Check `SELECT tile_url FROM app.layers LIMIT 1;` — is the domain correct?
- If Martin logs show `password authentication failed`, verify `APP_DB_PASSWORD` matches between the env and the DB

### Postgres won't start

Check disk space:

```bash
df -h
```

Check Postgres logs:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yaml logs postgres
```

**Common causes:**
- Volume permissions (rare on modern Docker)
- Corrupted volume (rare — restore from backup)
- Port 5432 already in use on host (only matters if you exposed it)

### CSV / Excel export truncated

Increase nginx proxy timeout in `apps/web/nginx.conf`:

```nginx
proxy_read_timeout 600s;   # up from 300s
proxy_send_timeout 600s;
```

Rebuild web:

```bash
make prod-up
```

---

## 10. Production Hardening

### 10.1 Put Caddy or Traefik in front for HTTPS

Auto-HTTPS via Let's Encrypt with Caddy is a 20-line addition. Add this service to `infra/docker-compose.prod.yaml`:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: geo-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - martin
    networks:
      - app_net
```

Change `web` to NOT expose port 80:

```yaml
  web:
    # remove:  ports: - "80:80"
```

Create `infra/caddy/Caddyfile`:

```caddyfile
your-domain.com {
    reverse_proxy web:80
}

tiles.your-domain.com {
    reverse_proxy martin:3000
}
```

Add volumes at the top of the compose file:

```yaml
volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

Then in `.env.prod`:

```bash
COOKIE_SECURE=true
COOKIE_DOMAIN=.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

Rebuild:

```bash
make prod-up
```

Caddy handles Let's Encrypt automatically. Point your DNS `A` records at the server and it just works.

### 10.2 Secrets management

For **real** production, move secrets out of `.env.prod`:

- Use Docker Secrets, HashiCorp Vault, or AWS Secrets Manager
- Populate env vars at container start
- Never bake secrets into images

### 10.3 Rate limiting

Add to the nginx config (or Caddy) to prevent brute-force login attempts:

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

location /api/v1/auth/login {
    limit_req zone=login burst=10 nodelay;
    proxy_pass http://api:5442;
    # ... rest of proxy config
}
```

### 10.4 Firewall

Only allow the ports you need:

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

Never expose Postgres (5432) or the API port (5442) publicly.

---

## 11. Security Checklist

Before going live, verify **every** item:

- [ ] `.env.prod` is **not** in git (`git status` shows it as ignored)
- [ ] `JWT_SIGNING_KEY` is 32+ random characters (not a phrase)
- [ ] `POSTGRES_PASSWORD` is a strong random password
- [ ] `APP_DB_PASSWORD` is different from `POSTGRES_PASSWORD` and equally strong
- [ ] `SUPERUSER_PASSWORD` was changed after first login
- [ ] `COOKIE_SECURE=true` (only for HTTPS deployments)
- [ ] `CORS_ALLOWED_ORIGINS` lists only production URLs, no `localhost`
- [ ] Postgres port 5432 is not exposed to the internet
- [ ] Docker containers run as non-root (already handled in Dockerfiles)
- [ ] Backups are running and tested (restore drill!)
- [ ] Server firewall allows only 22, 80, 443
- [ ] TLS certificate is valid and auto-renews (Caddy/Let's Encrypt handles this)
- [ ] Application version is pinned (don't use `:latest` for base images in prod)
- [ ] Log aggregation is configured (or you're comfortable with `docker logs`)
- [ ] Monitoring / alerting is set up (Uptime Kuma, Datadog, etc.)

---

## Appendix — File Locations

```text
n-taa/
├── infra/
│   ├── docker-compose.prod.yaml         production stack definition
│   ├── .env.prod                        secrets (DO NOT COMMIT)
│   ├── .env.prod.example                template
│   ├── caddy/Caddyfile                  (if using Caddy)
│   ├── postgres/
│   │   ├── bootstrap.sql                initial schema
│   │   ├── dbo_hardening.sql            PKs + indexes
│   │   ├── dbo_layers_seed.sql          layer registry
│   │   └── dbo_layers_style_seed.sql    symbology
│   └── martin/config.yaml               Martin config
│
├── services/api/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── ... (Go source)
│
└── apps/web/
    ├── Dockerfile
    ├── nginx.conf
    ├── .dockerignore
    └── ... (React source)
```

---

## Appendix — Makefile Targets

Quick reference:

```bash
make prod-build      # Build images
make prod-up         # Build + start everything
make prod-down       # Stop (keep data)
make prod-nuke       # Stop + wipe data (DEV ONLY)
make prod-logs       # Tail all logs
make prod-ps         # Container status
```

---

## Getting Help

- Check container logs first: `make prod-logs`
- Check Postgres logs specifically: `docker compose logs postgres`
- Verify env vars loaded: `docker compose config`

Good luck! 🚀
