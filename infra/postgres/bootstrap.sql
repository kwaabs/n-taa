-- ============================================================
-- geo-app bootstrap
-- Run once against the geo database as the postgres role.
--   make db-bootstrap-docker
--
-- Idempotent (safe to re-run) except for the geo_app password.
-- ============================================================


-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─────────────────────────────────────────────
-- Schemas (owned by whoever runs bootstrap)
-- ─────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS dbo AUTHORIZATION CURRENT_USER;

COMMENT ON SCHEMA app IS 'Application metadata: users, auth, layer registry.';
COMMENT ON SCHEMA dbo IS 'GIS data tables. Owned by you. Served by Martin.';

-- ─────────────────────────────────────────────
-- Application role (geo_app)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geo_app') THEN
    CREATE ROLE geo_app LOGIN PASSWORD 'geo_app_dev_pw';
  END IF;
END
$$;

-- NOTE: DB-level CONNECT is granted to PUBLIC by default, so geo_app inherits it.
-- We only grant schema/object privileges here.

GRANT USAGE ON SCHEMA app TO geo_app;
GRANT USAGE ON SCHEMA dbo TO geo_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA app TO geo_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA dbo TO geo_app;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA app TO geo_app;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA dbo TO geo_app;

-- Future objects created by the bootstrap role auto-grant to geo_app
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO geo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA dbo
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO geo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO geo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA dbo
  GRANT USAGE, SELECT ON SEQUENCES TO geo_app;

-- ─────────────────────────────────────────────
-- updated_at trigger helper
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- app.users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  display_name  text   NOT NULL,
  role          text   NOT NULL DEFAULT 'viewer'
                       CHECK (role IN ('superuser', 'editor', 'viewer')),
  status        text   NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON app.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_role   ON app.users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON app.users (status);

-- ─────────────────────────────────────────────
-- app.identities
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.identities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  provider       text NOT NULL
                 CHECK (provider IN ('local', 'azure', 'google')),
  subject        text NOT NULL,
  password_hash  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject),
  CHECK (
    (provider = 'local'  AND password_hash IS NOT NULL) OR
    (provider <> 'local' AND password_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_identities_user_id
  ON app.identities (user_id);

-- ─────────────────────────────────────────────
-- app.refresh_tokens
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON app.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON app.refresh_tokens (expires_at);

-- ─────────────────────────────────────────────
-- app.layers
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.layers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  schema_name      text NOT NULL DEFAULT 'dbo',
  table_name       text NOT NULL,
  id_column        text NOT NULL DEFAULT 'ogc_fid',
  geometry_column  text NOT NULL DEFAULT 'the_geom',
  geometry_type    text NOT NULL
                   CHECK (geometry_type IN (
                     'Point', 'MultiPoint',
                     'LineString', 'MultiLineString',
                     'Polygon', 'MultiPolygon',
                     'Geometry'
                   )),
  srid             int  NOT NULL DEFAULT 4326,
  editable         boolean NOT NULL DEFAULT true,
  style            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_name, table_name)
);

DROP TRIGGER IF EXISTS trg_layers_updated_at ON app.layers;
CREATE TRIGGER trg_layers_updated_at
  BEFORE UPDATE ON app.layers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ─────────────────────────────────────────────
-- Done.
-- ─────────────────────────────────────────────
