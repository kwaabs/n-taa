-- ============================================================
-- Seed app.layers from every dbo geometry table.
-- Idempotent — ON CONFLICT keeps existing rows untouched.
-- ============================================================

DO $$
DECLARE
  r        record;
  disp     text;
  base     text;
  suffix   text;
  gtype    text;
BEGIN
  FOR r IN
    SELECT f_table_name AS t, srid
    FROM   geometry_columns
    WHERE  f_table_schema = 'dbo'
    ORDER  BY f_table_name
  LOOP
    -- Strip 'dbo_' prefix and '_evw' suffix
    base := regexp_replace(r.t, '^dbo_', '');
    base := regexp_replace(base, '_evw$', '');

    -- Split off known trailing tags: _11kv, _33kv, _lvle, _dss
    suffix := NULL;
    IF base ~ '_(11kv|33kv|lvle|dss)$' THEN
      suffix := upper(regexp_replace(base, '.*_', ''));
      base   := regexp_replace(base, '_(11kv|33kv|lvle|dss)$', '');
    END IF;

    -- Also strip an interior _33kv_11kv style (capacitor case)
    base := regexp_replace(base, '_33kv_11kv$', '');

    -- Title-case: underscores → spaces, capitalise each word
    disp := initcap(replace(base, '_', ' '));

    -- Reattach the tag if any
    IF suffix IS NOT NULL THEN
      disp := disp || ' (' || suffix || ')';
    END IF;

    -- Special-case: "Oh " → "OH ", "Ug " → "UG "
    disp := regexp_replace(disp, '^Oh ', 'OH ');
    disp := regexp_replace(disp, '^Ug ', 'UG ');
    disp := regexp_replace(disp, ' Dss$', ' DSS');

    -- All our tables use generic GEOMETRY; classify simply
    gtype := 'Geometry';

    INSERT INTO app.layers (
      name, display_name, schema_name, table_name,
      id_column, geometry_column, geometry_type, srid, editable
    ) VALUES (
      r.t, disp, 'dbo', r.t,
      'ogc_fid', 'the_geom', gtype, COALESCE(NULLIF(r.srid,0), 4326), true
    )
    ON CONFLICT (schema_name, table_name) DO NOTHING;

  END LOOP;
END $$;
