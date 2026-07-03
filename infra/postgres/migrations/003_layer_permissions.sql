-- Layer-level permissions
ALTER TABLE app.layers
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT
    '{"view_roles": ["superuser", "editor", "viewer"], "export_roles": ["superuser", "editor", "viewer"]}'::jsonb;

-- Index for permission queries (useful when we filter layer list)
CREATE INDEX IF NOT EXISTS layers_permissions_gin_idx
  ON app.layers USING GIN (permissions);
