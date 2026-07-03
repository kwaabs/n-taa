-- Add columns for Azure AD authentication
ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS auth_source text NOT NULL DEFAULT 'local'
    CHECK (auth_source IN ('local', 'azure')),
  ADD COLUMN IF NOT EXISTS azure_object_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Mark all pre-existing users as local (they were seeded before Azure)
UPDATE app.users
SET    auth_source = 'local'
WHERE  auth_source IS NULL OR auth_source = '';

-- Index for Azure lookups
CREATE INDEX IF NOT EXISTS users_azure_object_id_idx
  ON app.users(azure_object_id)
  WHERE azure_object_id IS NOT NULL;

-- Index for pending users
CREATE INDEX IF NOT EXISTS users_pending_idx
  ON app.users(pending)
  WHERE pending = true;
