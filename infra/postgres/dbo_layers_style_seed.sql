-- =====================================================================
-- Layer style seed v3
-- Colors:
--   LINES (voltage-split by table name) → voltage color scheme
--     33kV = blue, 11kV = red, LVLE = orange
--   POINTS → semantic asset-family colors (NOT voltage)
--   POLYGONS → warm yellow with brown outline
-- Idempotent — overwrites style for every row.
-- =====================================================================

DO $$
DECLARE
  r record;
  new_style jsonb;
BEGIN
  FOR r IN SELECT id, table_name FROM app.layers LOOP

    new_style := CASE

      -- ══════════════ LINE ASSETS (voltage-colored) ══════════════

      -- 33 kV
      WHEN r.table_name = 'dbo_oh_conductor_33kv_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#2563eb', 'width', 2)
      )
      WHEN r.table_name = 'dbo_ug_cable_33kv_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#2563eb', 'width', 2, 'dash', jsonb_build_array(3,2))
      )

      -- 11 kV
      WHEN r.table_name = 'dbo_oh_conductor_11kv_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#dc2626', 'width', 1.75)
      )
      WHEN r.table_name = 'dbo_ug_cable_11kv_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#dc2626', 'width', 1.75, 'dash', jsonb_build_array(3,2))
      )

      -- LVLE
      WHEN r.table_name = 'dbo_oh_conductor_lvle_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#f97316', 'width', 1.25)
      )
      WHEN r.table_name = 'dbo_ug_cable_lvle_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#f97316', 'width', 1.25, 'dash', jsonb_build_array(3,2))
      )
      WHEN r.table_name = 'dbo_service_line_lvle_evw' THEN jsonb_build_object(
        'line', jsonb_build_object('color', '#f97316', 'width', 1)
      )

      -- Structure lines (support structures — points, but grouped under voltage)
      WHEN r.table_name = 'dbo_oh_support_structure_33kv_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'pole', 'size', 0.85, 'color', '#2563eb')
      )
      WHEN r.table_name = 'dbo_oh_support_structure_11kv_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'pole', 'size', 0.8, 'color', '#dc2626')
      )
      WHEN r.table_name = 'dbo_oh_support_structure_lvle_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'pole', 'size', 0.75, 'color', '#f97316')
      )

      -- ══════════════ POINT ASSETS (semantic categories) ══════════════

      -- ─── Protection & switching devices → GOLD ────────
      WHEN r.table_name = 'dbo_breaker_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'breaker', 'size', 1, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_isolator_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'isolator', 'size', 1, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_load_break_switch_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'lbs', 'size', 1, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_sectionalizer_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'sectionalizer', 'size', 1, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_pole_mounted_autorecloser_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'recloser', 'size', 1, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_circuit_switches_dss_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'breaker', 'size', 0.95, 'color', '#ca8a04')
      )
      WHEN r.table_name = 'dbo_switch_gear_panel_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'switchgear', 'size', 1, 'color', '#ca8a04')
      )

      -- ─── Measurement → TEAL ───────────────────────────
      WHEN r.table_name = 'dbo_arrester_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'arrester', 'size', 1, 'color', '#0d9488')
      )
      WHEN r.table_name = 'dbo_current_transformer_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'ct', 'size', 0.95, 'color', '#0d9488')
      )
      WHEN r.table_name = 'dbo_current_transformer_dss_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'ct', 'size', 0.9, 'color', '#0d9488')
      )
      WHEN r.table_name = 'dbo_voltage_transformer_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'vt', 'size', 0.95, 'color', '#0d9488')
      )
      WHEN r.table_name = 'dbo_customer_meter_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'meter', 'size', 0.9, 'color', '#0d9488')
      )
      WHEN r.table_name = 'dbo_customer_meter_lvle_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'meter', 'size', 0.8, 'color', '#0d9488')
      )

      -- ─── Power conversion → DEEP INDIGO ───────────────
      WHEN r.table_name IN (
        'dbo_power_transformer_evw',
        'dbo_station_transformer_evw',
        'dbo_earthing_transformer_evw',
        'dbo_distribution_transformer_dss_evw'
      ) THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'transformer', 'size', 1.1, 'color', '#4338ca')
      )
      WHEN r.table_name IN ('dbo_capacitor_33kv_11kv_evw', 'dbo_capacitor_bank_evw') THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'capacitor', 'size', 1, 'color', '#4338ca')
      )

      -- ─── Structural conductors → SLATE ────────────────
      WHEN r.table_name = 'dbo_busbar_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'busbar', 'size', 1, 'color', '#475569')
      )

      -- ─── SCADA / protection relays / electronics → VIOLET ─
      WHEN r.table_name IN ('dbo_scada_device_evw', 'dbo_scada_device_dss_evw') THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'scada', 'size', 1, 'color', '#7c3aed')
      )
      WHEN r.table_name IN ('dbo_protection_relay_evw', 'dbo_remote_relay_evw') THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'relay', 'size', 1, 'color', '#7c3aed')
      )
      WHEN r.table_name IN (
        'dbo_remote_control_panel_evw',
        'dbo_tap_changer_control_panel_evw'
      ) THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'panel', 'size', 1, 'color', '#7c3aed')
      )

      -- ─── AC/DC distribution panels → WARM BROWN ───────
      WHEN r.table_name IN ('dbo_ac_distribution_panel_evw', 'dbo_dc_distribution_panel_evw') THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'panel', 'size', 1, 'color', '#a16207')
      )

      -- ─── Buildings, kiosks, pillars → WARM BROWN ──────
      WHEN r.table_name IN (
        'dbo_control_building_evw',
        'dbo_control_building_dss_evw',
        'dbo_marshalling_kiosk_evw',
        'dbo_distribution_pillar_dss_evw'
      ) THEN jsonb_build_object(
        'point',   jsonb_build_object('icon', 'building', 'size', 1, 'color', '#a16207'),
        'polygon', jsonb_build_object('fill_color', '#facc15', 'fill_opacity', 0.35, 'outline_color', '#a16207')
      )

      -- ─── Battery / earth → GRAY ───────────────────────
      WHEN r.table_name IN ('dbo_battery_cell_evw', 'dbo_battery_charger_evw') THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'battery', 'size', 1, 'color', '#64748b')
      )
      WHEN r.table_name = 'dbo_earthing_resistor_evw' THEN jsonb_build_object(
        'point', jsonb_build_object('icon', 'earth', 'size', 1, 'color', '#64748b')
      )

      -- ─── Fallback ─────────────────────────────────────
      ELSE jsonb_build_object(
        'point', jsonb_build_object('icon', 'dot', 'size', 1, 'color', '#475569')
      )

    END;

    UPDATE app.layers SET style = new_style WHERE id = r.id;
  END LOOP;
END $$;

SELECT display_name,
       style->'point'->>'icon'  AS icon,
       style->'point'->>'color' AS point_color,
       style->'line'->>'color'  AS line_color
FROM   app.layers
ORDER  BY display_name;
