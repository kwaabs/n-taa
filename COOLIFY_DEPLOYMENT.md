# n-TAA Deployment Guide (Coolify)

Complete step-by-step deployment for the n-TAA geospatial platform on Coolify.

**Target domain:** `taa.prwea.ecggh.com`
**Stack:** PostgreSQL/PostGIS · Martin · Go API · React (nginx)

---

## Table of Contents

1. Prerequisites
2. Configure Environment Variables
3. Deploy the Stack
4. Verify Container Health
5. Load Utility Data
6. Run SQL Scripts (in order)
7. Restart Martin
8. Verification Checklist
9. Common Operations
10. Troubleshooting
11. Data Refresh Procedure

---

## 1. Prerequisites

Before starting, make sure you have:

- Coolify installed and accessible
- Server with at least 4 GB RAM, 20 GB disk
- DNS records configured:
  - `taa.prwea.ecggh.com` → server IP
  - Martin subdomain → server IP
  - API subdomain → server IP
- Your utility data ready to import (shapefiles, dump file, or CSV)
- A `psql` client on your local machine (optional but helpful)

---

## 2. Configure Environment Variables

In Coolify, create environment variables for the stack.

**Replace `CHANGE_ME` values before deployment.**

```env
# Database
POSTGRES_DB=geo
POSTGRES_PASSWORD=CHANGE_ME_SUPABASE_ADMIN_PASSWORD

APP_DB_USER=geo_app
APP_DB_PASSWORD=CHANGE_ME_GEO_APP_PASSWORD

DATABASE_URL=postgres://geo_app:CHANGE_ME_GEO_APP_PASSWORD@postgres:5432/geo?sslmode=disable

DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=5
DB_CONN_MAX_LIFETIME=30m

# API
API_ENV=production
API_LOG_LEVEL=info
API_HOST=0.0.0.0
API_PORT=5442

# Auth
JWT_SIGNING_KEY=CHANGE_ME_32_PLUS_RANDOM_CHARACTERS
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=720h
JWT_ISSUER=geo-app

# Superuser (first admin)
SUPERUSER_EMAIL=admin@taa.prwea.ecggh.com
SUPERUSER_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
SUPERUSER_NAME=Administrator

# Cookies & CORS
CORS_ALLOWED_ORIGINS=https://taa.prwea.ecggh.com
COOKIE_DOMAIN=taa.prwea.ecggh.com
COOKIE_SECURE=true

# Martin
MARTIN_PUBLIC_URL=https://cw8sww0kwkcg40o4gs40owgg.prwea.ecggh.com

# Coolify service URLs
SERVICE_URL_MARTIN=https://cw8sww0kwkcg40o4gs40owgg.prwea.ecggh.com
SERVICE_FQDN_MARTIN=cw8sww0kwkcg40o4gs40owgg.prwea.ecggh.com

SERVICE_URL_API=https://goc0css4s0gogs04o0co88sw.prwea.ecggh.com
SERVICE_FQDN_API=goc0css4s0gogs04o0co88sw.prwea.ecggh.com

SERVICE_URL_WEB=https://taa.prwea.ecggh.com
SERVICE_FQDN_WEB=taa.prwea.ecggh.com
```

### Generate the JWT signing key

Run on any Linux/Mac machine:

```bash
openssl rand -base64 48
```

Copy the output and paste it as the value for `JWT_SIGNING_KEY`.

### Critical rules

The password in `DATABASE_URL` **must exactly match** `APP_DB_PASSWORD`.

Example:

```env
APP_DB_PASSWORD=Tk9!mFaR2q7#Lx8P
DATABASE_URL=postgres://geo_app:Tk9!mFaR2q7#Lx8P@postgres:5432/geo?sslmode=disable
```

Any mismatch will cause the API to fail with `password authentication failed`.

---

## 3. Deploy the Stack

In Coolify:

1. Point Coolify at your Git repository
2. Set the compose file to `infra/docker-compose.prod.yaml`
3. Set the env file to the one you created in Step 2
4. Configure domain routing:
   - `taa.prwea.ecggh.com` → web container port 80
   - API subdomain → api container port 5442
   - Martin subdomain → martin container port 3000
5. Click **Deploy**

First build takes **3–5 minutes** (both Docker images are built from source).

---

## 4. Verify Container Health

In Coolify, confirm all four services are healthy:

```text
✓ postgres — healthy
✓ martin — running
✓ api — healthy
✓ web — healthy
```

Then verify externally:

```bash
curl -fsS https://taa.prwea.ecggh.com/healthz
# → ok

curl -fsS https://taa.prwea.ecggh.com/api/v1/ping
# → {"pong":"true"}
```

If any of these fail, jump to **Section 10 — Troubleshooting**.

---

## 5. Load Utility Data

Open the Postgres container terminal from Coolify.

Get a psql shell:

```bash
psql -U supabase_admin -d geo
```

Then load your utility asset tables into the `dbo` schema.

### Option A — Restore from pg_dump

```bash
pg_restore -U supabase_admin -d geo --schema=dbo /path/to/dump.sql
```

### Option B — Import from shapefiles via ogr2ogr

If you're using `ogr2ogr` from outside the container:

```bash
ogr2ogr -f PostgreSQL \
  "PG:host=<server-ip> port=5432 dbname=geo user=supabase_admin password=<POSTGRES_PASSWORD>" \
  my_data.shp \
  -nln dbo_my_layer_evw \
  -lco SCHEMA=dbo \
  -lco GEOMETRY_NAME=the_geom \
  -lco FID=ogc_fid \
  -lco FID64=YES \
  -nlt PROMOTE_TO_MULTI \
  -t_srs EPSG:4326
```

Repeat for each layer.

### Verify tables imported

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'dbo'
ORDER BY tablename;
```

You should see every dbo table listed.

---

## 6. Run SQL Scripts (in order)

Still inside `psql`, run these scripts one after another.

### 6.1 Harden the schema

Adds primary keys and spatial indexes to every dbo geometry table.

```sql
\i /path/to/infra/postgres/dbo_hardening.sql
```

Or paste the file contents into psql.

**Verify:**

```sql
SELECT table_name
FROM information_schema.table_constraints
WHERE constraint_type = 'PRIMARY KEY'
AND table_schema = 'dbo'
ORDER BY table_name;
```

Every dbo table should appear with a PK.

### 6.2 Seed the layer registry

Populates `app.layers` with one row per dbo geometry table.

```sql
\i /path/to/infra/postgres/dbo_layers_seed.sql
```

**Verify:**

```sql
SELECT count(*) FROM app.layers;
```

Count shou*d match the number of dbo tables y*u loaded.

### 6.3 Apply layer sty*es

Sets voltage-based colors, ico*s, and rendering rules.

```sql
\i*/path/to/infra*postgres/dbo_layers_style_seed.sql*```

**Verify:**

```sql
SELECT di*play_name, style IS NOT NULL AS ha*_style
FROM app.layers
ORDER BY di*play_name;
```

Every layer should*have `has_style = true`.

### 6.4 *reate derived layers (optional)

I* you use*custom views, dissolves, or materi*lized layers, run those*scripts now.

Examples:

```sql
\i*/path/to/infra/postgres/dbo_ecg_re*ions.sql
```

If Step 6.4 created *ew tables, **rerun Step 6.2 and 6.*** to register and style them.

##* 6.* Add feeder trace indexes

Require* for the feeder tracing feature.

*``sql
DO $$
D*CLARE r record;
BEGIN
  FOR r IN
 *  SELECT unnest(ARRAY[
      'dbo_oh_conductor_11kv_evw',
      'dbo_oh_conductor_33kv_evw',
      'dbo_ug_cable_11kv_evw',
      'dbo_ug_cable_33kv_evw'
    ]) AS t
  LOOP
 *  EXECUTE format(
      'CREATE IN*EX IF NOT EXISTS %I ON dbo.%I ((lo*er(TRIM(circuit_id))))',
      r.t*|| '_circuit_id_norm_idx', r.t
   *);

    EXECUTE format(
      'CRE*TE INDEX IF NOT EXISTS %I*ON dbo.%I ((TRIM(other_circuit_id)*)',
      r.t || '_other_circuit_i*_norm_idx', r.t
    );
  END LOOP;*END $*;
```

### 6.6 Add DSS transformer*trace indexes

Required for feeder*trace + transformer disc*very.

```sql
CREATE INDEX IF NOT *XISTS
  dbo_distribution_transform*r_dss_evw_circuit_id_norm_idx
  ON*dbo*dbo_distribution_transformer_dss_e*w
  ((lower(trim(circuit_id))));

*REATE INDEX IF NOT EXISTS
  dbo_di*t*ibution_transformer_dss_evw_other_*ircuit_id_norm_idx
  ON dbo.dbo_di*tribution_transformer_dss_evw
  ((*rim(other_circuit_*d)));
```

Exit psql:

```sql
\q
`*`

---

## 7. Restart Martin

**Th*s step*is mandatory.**

Martin only disco*ers tile sources at startup. Resta*t the Martin service from Coolify*UI.

Wait 10–15 seconds after rest*rt.

### Verify Martin

```bash
cu*l -fsS https://cw8sww0kwkcg40o4gs40owgg.prwea.ecggh.com/catalog | jq *.tiles | keys | length'
```

Shoul* return the number of dbo geometry*tables you loaded.

If empty:
- Co*firm data was loaded before restar*
- Check Martin logs in*Coolify

---

## 8. Verification C*ecklist

Open `https://taa.prwea.e*ggh.com` in a browser.

Log in wit* your*`SUPERUSER_EMAIL` and `SUPERUSER_P*SSWORD`.

### Basic

- [ ] Login*succeeds
- [ ] Header shows your n*me/avatar
- [ ] Sidebar loads with*layers
- [ ] Toggling a layer rend*rs on the map

### Features

- [ ]*Clicking a feature opens the drawe*
- [ ] Att*ibutes tab shows correct data
- [ * Condition tab appears where relev*nt
- [ ] Record history*shows `created_at/updated_by` etc.*- [ ] Location metadata shows `esr*gnss*` fields

### Search

- [ ] S*arch panel opens
- [ * Building an attribute query works*- [ ] Running search returns resul*s
- [ ] Results table opens
- [ ] *al* overlay pulses on map

### Export*

- [ ] CSV export works
- [ ] Exc*l export works
- [ ] GeoJSON*export works
- [ ] Whole-layer exp*rt from sidebar works

### Print

* [ ] Print button*opens modal
- [ ] Preview renders *urrent map
- [ ] PDF download work*
- [ ] PNG download works

### Map*tools

- [*] Fly to lat/lng works
- [ ] Live *ursor coordinates
- [ ] Scale b*r visible and updating
- [ ] Dista*ce measure works
- [ ] Area measur* works
- [ ] Select area works*
### Spatial analysis

- [ ] Click*district polygon → Contents shows *ounts
- [ * Right-click feature → Buffer work*
- [ ] Buffer results appear on ma*

### Feeder trace*
- [ ] OH conductor Feeder tab app*ars
- [ ] Trace run* and shows breakdown
- [ ] Compani*n (UG cable) can be included
- [ ]*DSS transformer overlay can be inc*uded
- [*] Zoom to feeder works
- [ ] Click*ng a non-traceable feature hides F*eder tab

If*any of these fail, jump to **Secti*n 10 — Troubleshooting**.

---

##*9. Common Operations

### Get a*psql shell

Open the Postgres cont*iner terminal in Coolify and run:
*```bash
psql -U supabase_admin -d *eo
```

###*Change a user's password

Inside p*ql:

```sql
UPDATE app.identities
*ET password_hash = crypt('new-stro*g-password', g*n_salt('bf'))
WHERE provider = 'lo*al' AND subject = 'admin@taa.prwea*ecggh.com';
```

### Add a new adm*n

Insert into `app.users` and `ap*.identities`. Consult the app's au*h logic or use the app's admin U* if you build one later.

### Rest*rt a service

From Coolify UI — cl*ck the service → Restart.

### Vie* logs

From Coolify UI — click the*service →*Logs.

### Check container status
*Coolify UI shows health of each co*tainer in real time.

---

## *0. Troubleshooting

### API keeps *estarting

Check the API logs in C*olify.

**Common causes:**

| Erro* | F*x |
|-------|-----|
| `password au*hentication failed` | `APP_DB_PASS*ORD` and password in `DATABASE_URL* don't match |
| `JWT_SI*NING_KEY must be at least 32 chars* | Regenerate with `openssl rand -*ase64 48` |
| `DATABASE_URL is req*ired` | Env*variable missing or empty |

### F*ontend loads but shows CORS or 401*errors

- Verify `CORS_ALLOWED_ORI*INS=https://taa.prwea.ecggh.com` (*xact match)
- Verify `COOKIE*DOMAIN=taa.prwea.ecggh.com` (no pr*tocol)
- Verify `COOKIE_SECURE=tru*`

###*Layers panel is empty

- Confirm t*bles exist: `\dt dbo.*`
- Confirm **rdening ran: `SELECT count(*) FROM*information_schema.table_constrain*s WHERE table_schema='dbo' AND con*traint_type='PRIMARY KEY';`
- Conf*r* layer seed ran: `SELECT count(*) *ROM app.layers;`

### Tiles don't *ender

- Check Martin catalog: `cu*l https://cw8sww*kwkcg40o4gs40owgg.prwea.ecggh.com/*atalog`
- Check `SELECT tile_url F*OM app.layers LIMIT 1;* — is it pointing at the public Ma*tin URL?
- If layers point at `loc*lhost:5441`, fix them:

```sql
UP*ATE app.layers
SET tile_url = REPL*CE(
  tile_url,
  'localhost:5441'*
  'cw8sww0kwkcg40o4*s40owgg.prwea.ecggh.com'
);

UPDAT* app.layers
SET tile_url = REPLACE*tile_url, 'http://', 'https://');
*``*
Then hard-refresh the frontend.

*## Postgres won't start

Check dis* space and Postgres logs. Common:*volume permissions, port conflict,*or corrupted volume.

### CSV/Exce* exports get*cut off

Increase nginx proxy time*ut in `apps/web/nginx.conf`*

```nginx
proxy_read_timeout 600s*
proxy_send_timeout 600s;
```

The* trigger a rebuild in Coolify.

##* Feeder trace returns "not traceab*e"

The layer isn't in the traceab*e list. Only:

```text
dbo_oh_cond*ctor_11kv_evw
dbo_oh_conductor_33k*_*vw
dbo_ug_cable_11kv_evw
dbo_ug_ca*le_33kv_evw
```

can be traced. Co*firm the*layer name matches exactly.

### F*eder trace runs but "no feeder key*on this feature"

The feature has *ull*`circuit_id` and null `other_circu*t_id`. Try a different segment.

-*-

## 11. Data Refresh Procedure

*hen new asset data arrives:

1* Load the new data (or overwrite e*isting tables)
2. Run `dbo_hardeni*g.sql`
3. Run `dbo_layers_seed.sql**4. Run `dbo_layers_style_seed.sql`*5. Run any derived-layer scripts i* needed
6. Rerun steps 3*4 if new tables were created
7. Re*un the feeder trace index script i* new*conductor/cable tables were added
*. Restart Martin
9. Verify layers *ppear in the UI

That's the entire*refresh workflow.*
---

## Security Reminders

- Nev*r commit env vars with real passwo*ds to git
-*Change the initial superuser passw*rd after first login
- Regenerate *he JWT signing key if you su*pect it leaked
- Set up nightly ba*kups of Postgres
- Keep only *orts 22 (SSH), 80 (HTTP), 443 (HTT*S) open on the server
- Co*lify handles TLS certificates auto*atically

---

## Getting Help

- *ontainer logs: Coolify UI → servic* → Logs
- Postgres logs: Coolify U* → postgres → Logs
- Martin catalo*: `cur* https://<martin-url>/catalog`
- F*ontend: browser DevTools → Console*+ Network

Good luck! *�
