-- ============================================================
-- dbo hardening
-- - PK on objectid
-- - UNIQUE index on globalid
-- - GIST index on the_geom
-- - Fix SRID=0 tables (assumed lat/lon → 4326)
-- Only touches tables registered in PostGIS geometry_columns.
-- Idempotent.
-- ============================================================

-- 1) Fix SRID=0 tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT f_table_name AS t
    FROM   geometry_columns
    WHERE  f_table_schema = 'dbo' AND srid = 0
  LOOP
    EXECUTE format(
      'UPDATE dbo.%I SET the_geom = ST_SetSRID(the_geom, 4326) WHERE ST_SRID(the_geom) = 0',
      r.t);
    EXECUTE format(
      'ALTER TABLE dbo.%I ALTER COLUMN the_geom TYPE geometry(Geometry, 4326) USING ST_SetSRID(the_geom, 4326)',
      r.t);
    RAISE NOTICE 'SRID fixed: dbo.%', r.t;
  END LOOP;
END $$;

-- 2) PK on objectid
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT f_table_name AS t
    FROM   geometry_columns
    WHERE  f_table_schema = 'dbo'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE  table_schema = 'dbo' AND table_name = r.t
        AND  constraint_type = 'PRIMARY KEY'
    ) THEN
      BEGIN
        EXECUTE format(
          'ALTER TABLE dbo.%I ADD CONSTRAINT %I PRIMARY KEY (objectid)',
          r.t, r.t || '_pk');
        RAISE NOTICE 'PK added: dbo.%', r.t;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'PK skipped: dbo.% — %', r.t, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- 3) UNIQUE index on globalid
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT f_table_name AS t
    FROM   geometry_columns
    WHERE  f_table_schema = 'dbo'
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON dbo.%I (globalid)',
        r.t || '_globalid_uq', r.t);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'globalid UNIQUE skipped: dbo.% — %', r.t, SQLERRM;
    END;
  END LOOP;
END $$;

-- 4) GIST index on the_geom
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT f_table_name AS t
    FROM   geometry_columns
    WHERE  f_table_schema = 'dbo'
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON dbo.%I USING GIST (the_geom)',
      r.t || '_the_geom_gist', r.t);
  END LOOP;
  RAISE NOTICE 'GIST indexes ensured on all dbo geometry columns';
END $$;
