# Layer & Symbology Guide

How to add new data layers, create custom symbols, and control how features render on the map.

---

## Table of Contents

1. #1-concepts
2. #2-adding-a-new-layer
3. #3-symbology-basics
4. #4-adding-a-new-icon
5. #5-styling-cheatsheet
6. #6-voltage-color-convention
7. #7-per-layer-styling-recipes
8. #8-dense-point-layers
9. #9-legend--visual-verification
10. #10-common-mistakes

---

## 1. Concepts

The app has two "layer" concepts:

```text
Physical table   → dbo.dbo_<name>_evw   PostGIS geometry data
                   ↓
Registry row     → app.layers            metadata + styling
                   ↓
Tile source      → Martin                serves vector tiles
                   ↓
Rendered layer   → MapLibre GL           draws on the map
```

Each **physical table** in the `dbo` schema needs:

1. A `PRIMARY KEY` on `ogc_fid`
2. A GIST index on `the_geom`
3. SRID = `4326`
4. A row in `app.layers` describing how it should behave

The **`app.layers.style` column** (jsonb) drives everything about how features render. That's the file we edit most.

---

## 2. Adding a New Layer

Assume you have a new shapefile or dataset. This is the complete flow.

### 2.1 Load the data into PostgreSQL

**With `ogr2ogr`:**

```bash
ogr2ogr -f PostgreSQL \
  "PG:host=localhost port=5440 dbname=geo user=supabase_admin password=$POSTGRES_PASSWORD" \
  path/to/my_data.shp \
  -nln dbo_new_layer_evw \
  -lco SCHEMA=dbo \
  -lco GEOMETRY_NAME=the_geom \
  -lco FID=ogc_fid \
  -lco FID64=YES \
  -nlt PROMOTE_TO_MULTI \
  -t_srs EPSG:4326
```

Key flags:

- `-nln dbo_new_layer_evw` — table name (follows the `dbo_<name>_evw` convention)
- `-lco GEOMETRY_NAME=the_geom` — matches what all our tables use
- `-lco FID=ogc_fid` — required — the PK column we'll use
- `-lco FID64=YES` — bigint IDs, safer for large datasets
- `-t_srs EPSG:4326` — reproject to WGS84

### 2.2 Verify the import

```bash
make db-psql-admin
```

Then:

```sql
\dt dbo.dbo_new_layer_evw
SELECT count(*), ST_GeometryType(the_geom), ST_**ID(the_geom)
FROM dbo.dbo_new_laye*_evw
LIMIT 1;
```

Should show*your row count, geometry type, and*SRID = 4326.

### 2.3 Add primary *ey + spatial index

```s*l
ALTER TABLE dbo.dbo_new_layer_ev*
  ADD CONSTRAINT dbo_new_layer_ev*_pk PRIMARY K*Y (ogc_fid);

CREATE INDEX dbo_new*layer_evw_the_geom_gist
  ON dbo.d*o_new_layer_evw USING GIST (the*geom);
```

If your imported data *oesn't have `ogc_fid` populated (r*re with ogr2ogr, common*with manual imports), add one:

``*sql
ALTER TABLE dbo.dbo_new_layer_*vw
  ADD COLUMN ogc_fid bigint GEN*RATED *LWAYS AS IDENTITY;

-- then the PK*+ index above
```

### 2.4 Registe* in*app.layers

```sql
INSERT INTO app*layers (
  name, display_name, sch*ma_name, table_name,
  id_column, *eometry_column, geomet*y_type, srid, editable, style
) VA*UES (
  'dbo_new_layer_evw',      *    -- name (must match table*name)
  'New Layer',              *     -- display_name (shown to use*)
  'dbo',                        * -- schema_name
  'dbo_new_layer_e*w',            -- table_name
  'og*_fid',                      -- id_*olumn
  'the_geom',               *     -- geometry_column
  'Geometr*',                     -- geometry*type
  4326,                      *    -- srid
  true,               *           -- editable
  '{}'::jso*b                     -- style — w*'ll set this next
);
```

### 2.5 *pply a style

See #3-symbology-bas*cs and #7-per-layer-styling-recipe* for the style JSON. Example*for a point layer:

```sql
UPDATE *pp.layers
SET style = jsonb_build_*bject(
  'point', jsonb_build_obje*t*
    'icon', 'transformer',
    's*ze', 1,
    'color', '#4338*a',
    'halo_color', '#ffffff',
 *  'halo_width', 1.25
  )
)
WHERE n*me = 'dbo_new_layer_evw';
```

###*2*6 Restart Martin so it discovers t*e new table

```bash
make infra-re*tart
sleep 5
make martin-count
```*
The*count should be one higher than be*ore.

### 2.7 Refresh the browser
*Log in and check the Lay*rs panel — your new layer appears *n the alphabetical list. Tick it t**render.

If it doesn't appear:

- *efresh with Ctrl-Shift-R (hard rel*ad)
-*Check the browser console for erro*s
- Verify: `SELECT * FROM app.lay*rs WHERE name = 'dbo_new_layer_evw*;`

---

## 3. Symbology Basics

T*e `app.layers.style` column is a j*onb with **three optional sections**:

```json*{
  "point":   { ... },
  "line": *  { ... },
  "polygon": { ... }
}
*``

Which section Map*ibre uses depends on each feature'* geometry. A single layer with mix*d geometries (rare in practice) ca**use all three.

### Point style ke*s

```json
{
  "point": {
    "ico*":       "arrester*,        // sprite name — see §4
 *  "size":       1,                *// multiplier — 1 *s default
    "color":      "#0d94*8",         // hex color for*SDF tint
    "halo_color": "#fffff*",         // outline halo — usual*y white
    "halo_width": 1.25,   *          // halo thickness in px
*   "opacity":    1*                 // 0 (transparent* → 1 (opaque)
    "minzoom":    8,*                // hide below*this zoom (dense layers)
    "rend*r_as":  "symbol"           // "sym*ol" | "circle" (see*§8)
  }
}
```

### Line style keys*
```json
{
  "line": {
    "color"*   "#dc2626",            */ stroke color
    "width":   2,  *                 // stroke thickne*s in px
    "opacity": 0.9,*    "dash":    [3, 2]             *  // [dash, gap] — omit for solid*  }
}
```

### Polygon style keys
*```json
{
  "polygon": {
    "fill*color":    "#3b82f6",
    "fill_op*city":  0.2*
    "outline_color": "#1e293b",
 *  "outline_width": 1.5
  }
}
```

*## Defaults

If a section is missi*g, the frontend applies sensible d*faults:

- Point → emerald dot (`#*59669`)
- Line → blue *.5px
- Polygon → amber 35% fill

B*t your custom styling will nearly *lways look better*than the defaults.

---

## 4. Add*ng a New Icon

Icons are rendered *s **SDF sprites** — single-color S*Gs that MapLibre re-colors at runt*me via `icon-color`.

### 4.1 Desi*n the SVG

Requ*rements:

- **24×24 viewBox** — ma*ches all existing icons
- **Single*fill color** (`black`*or `#000000`) — MapLibre replaces *t with the layer's `color`
- **No *radients, no mult*-color** — SDF can only tint one c*lor
- **Simple silhouettes** — chu*ky lines survive on sat*llite basemaps

Example — a "flag"*icon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24*24" width="24" height="24">
  <rec* x="6" y="3" width="2" height="18"*fill="black"/>
  <path d="M8 4 L18*6 L18 12 L8 10 Z" fill="black"/>
<*svg>
```

### 4.2 Save the SVG

Sa*e to `apps/web/src/assets/symbols/*lag.svg`.

**Filename becomes the *con name.** `flag.svg` → reference*as `"flag"` in style.

### 4.3 Reg*ster it in the ic*n registry

Open `apps/web/src/fea*ures/map/icons.ts`. Add the import*at the top:*
```ts
import flagSvg from "@/asse*s/symbols/flag.svg?raw";
```

Add *t to the `ICONS`*map:

```ts
export const ICONS: Re*ord<string, string> = {
  dot: dot*vg,
  arrester: arresterSvg,
  // *.. existing icons ...
  flag: fl*gSvg,     // ← new
};
```

That's *t. The `useSpriteLoader` hook will*pick it up automatically on next m*p*init.

### 4.4 Use it in a layer s*yle

```sql
UPDATE app.layers
SET *tyle = jsonb_set(*tyle, '{point,icon}', '"flag"')
WH*RE name = 'dbo_your_layer_evw';
``*

Refresh the browser. The layer r*nders with*the new icon.

### 4.5 Verify the *prite loaded

In the browser conso*e:

```js
__map.h*sImage('flag')
```

Should return *true`.

If `false`, check the file*was saved correctly and h*rd-refresh the browser.

### 4.6 S*mbol library — existing icons

The*app*ships with these icons (all in `ap*s/web/src/assets/symbols/`):

| Ic*n name | Typical use |
|-*---------|-------------|
| `dot` |*Fallback (small filled circle) |
|*`arrester` | Surge arresters |
| `*reaker` | Circ*it breakers |
| `isolator` | Isola*or switches |
| `lbs` | Load-break*switches |
| `sectionalizer` | Sec*ionalizers |*| `recloser` | Reclosers |
| `swit*hgear` | Switchgear panels |
| `tr*nsformer` | Power/distribution tra*sformers |
| `ct` | Current transf*rmers |
| `vt` | Voltage transform*rs |
| `meter` | Customer meters |*| `capacitor` | Capacitor banks |
* `busbar` | Busbars |
| `pole` | S*pport structures |
| `panel` | AC/*C distribution panels |
| `buildin*` | Control buildings / kiosks |
|*`battery` | Battery cells / charge*s |
| `earth` | Earthing resistors*|
| `scada` | SCADA devices*|
| `relay` | Protection relays |
*Reuse an existing icon whenever po*sible — creates visual consistency*

---*
## 5. Styling Cheatsheet

Copy-pa*te starters for common scenarios.
*### Point — single flat color

```*ql
U*DATE app.layers
SET style = jsonb_*uild_object(
  'point', jsonb_buil*_object(
    'icon', 'transformer'*
    'size', 1,
    '*olor', '#4338ca',
    'halo_color'* '#ffffff',
    'halo_width', 1.25*  )
)
WHERE name = 'dbo_your_layer*evw';*```

### Point — data-driven color*by attribute

Use a MapLibre expre*sion to color features by a column*value:

```sql
UPDATE app.layers
S*T style = jsonb_build_object(
  'p*int', jsonb_build_object(
    'ico*', 'arrester',
    'size', 1,
    *color', jsonb_build_array(
      '*atch',
      jsonb_build_array('ge*', 'region'),
      'Ashanti',    *#3b82f6',
      'Volta',      '#ec*899',
      'Eastern',    '#8b5cf6*,
      '*entral',    '#14b8a6',
      'Accr**East', '#f97316',
      'Accra Wes*', '#fb923c',
      'Tema',       *#eab308',
      'Western*,    '#22c55e',
      '#94a3b8'   * -- fallback (unknown region)
    *,
    'halo_color', '#ffffff',
   *'halo_width', 1.*5
  )
)
WHERE name = 'dbo_your_lay*r_evw';
```

### Line — solid

```*ql
UPDATE app.layers
SET style = j*onb_build*object(
  'line', jsonb_build_obje*t(
    'color', '#2563eb',
    'wi*th', 2
  )
)
WHERE name = 'dbo_you*_layer_evw';
```

### Line — dashe* (underground cable convention)

`*`sql
UPDATE app.layers
SET style =*jsonb_build_object(
  'line', json*_build_object(
    'color', '#2563*b',
    'width', 2,
    'dash',  j*onb_build_array(3, 2)
  )
)
WHERE *ame = 'dbo_your_layer_evw';
```

#*# Polygon — subtle fill + strong o*tline

```sql
UPDATE app.layers*SET style = jsonb_build_object(
  *polygon', jsonb_build_object(
    *fill_color',    '#3b82f6',
    'fi*l_opacity',  *.12,
    'outline_color', '#1e40af*,
    'outline_width', 2
  )
)
WHE*E name = 'dbo_your_layer_evw';
```*
### Polygon — data-driven fill

`*`sql
UPDATE app.layers
SET style =*jsonb_build_object(
  'polyg*n', jsonb_build_object(
    'fill_*olor', jsonb_build_array(
      'm*tch',
      jsonb_build_array('get*, 'region'),
      'Ashanti', '#3b*2f6',
      'Volta',   '#ec4899',
*     '#cbd5e1'
    ),
    'fill_op*city',  0.22,
    '*utline_color', '#1f2937',
    'out*ine_width', 1
  )
)
WHERE name = '*bo_your_layer_evw';
```

---

## 6* Voltage Color*Convention

Utility mapping conven*ion — apply consistently across yo*r grid:

| Voltage class | H*x     | Tailwind name | Meaning |
*---------------|---------|--------*------|---------|
| **33 kV**     * `#2563eb` | blue-600  | High volt*ge |
| **11 kV**     | `#dc2626` |*red-600   * Medium voltage |
| **LVLE**      * `#f97316` | orange-500 | Low volt*ge / custom*r |
| Non-voltaged (buildings, bat*eries) | `#475569` | slate-600 | N*utral gray |

Applied to **line as*ets** where voltage is baked into *he table name:

```text*dbo_oh_conductor_33kv_evw   → blue*solid
dbo_oh_conductor_11kv_evw   * red solid
dbo_o*_conductor_lvle_evw   → orange thi*

dbo_ug_cable_33kv_evw       → bl*e dashed
dbo_ug_cable_11kv_evw    *  → red dashed
dbo_ug_cable_lvle_e*w       → orange dashed
```

For **point assets** with voltage attrib*tes, use data-driven color from th* attribute (see previous section).*
For **device lay*rs** (breakers, transformers, arre*ters) — use semantic asset-family *olors, not voltage:

| Category | **x | Assets |
|----------|-----|---*----|
| Protection & switching | `*ca8a04` (gold) | Bre*kers, isolators, LBS, sectionalize*s, reclosers, switchgear |
| Measu*ement | `#0d9488` (teal) | Arreste*s, CTs, V*s, meters |
| Power conversion | `*4338ca` (indigo) | Transformers, c*pacitors |
| Structural | `#475569* (slate) |*Busbars |
| Electronics | `#7c3aed* (violet) | SCADA, relays, control*panels |*| Facilities | `#a16207` (brown) |*Buildings, kiosks, pillars |*
---

## 7. Per-Layer Styling Reci*es

Complete style JSON blocks for*common*utility asset types.

### Arrester*

```json
{
  "point": {
    "icon*: "arrester",
    "size": 1,
    "*olor": "#0d9488",
    "halo_color"* "#ffffff",
    "halo_width": 1.25*  }
}
```

### Breakers, isolators* switchgear

```json
{
  "point": *
    "icon": "breaker",
    "size"* 1,
    "color": "#ca8a04",
    "h*lo_color": "#ffffff",
    "halo_wi*th": 1.25
  }
}
```

### Power / D*stribution transformers

```json
{*  "point": {
    "icon": "transfor*er",
    "size": 1.1,
    "color":*"#4338ca",
    "halo_color": "#fff*ff",
    "halo_width": 1.25
  }
}
*``

### OH conductor (voltage-colo*ed)

```json
{
  "line": {
    "co*or": "#dc2626",
    "width": 1.75
* }
}
```

### UG cable (voltage-co*ored + dashed)

```json
{
  "line"* {
    "color": "#dc2626",
    "wi*th": 1.75,
    "dash": [3, 2]
  }
*
```

### Districts / regions (sem*-transparent overlay)

```json
{
 *"polygon": {
    "fill_color": "#3*82f6",
    "fill_opacity": 0.15,
 *  "outline_color": "#1e40af",
    *outline_width": 2
  }
}
```

---

*# 8. Dense Point Layers

Layers wi*h **hundreds of thousands of point*features** (customer meters, poles* will crash MapLibre's icon atlas *f rendered as symbols. Two mitigat*ons, apply both:

### 8.1 Set a mi*zoom

Hide the layer at country/re*ional view. Only render when zoome* in enough that per-tile counts ar* manageable:

```sql
UPDATE app.la*ers
SET style = jsonb_set(style, '*point,minzoom}', '13'::jsonb)
WHER* name = 'dbo_customer_meter_lvle_e*w';
```

Recommended thresholds:

* Feature count | Suggested minzoom*|
|---------------|---------------*---|
| < 5,000       | 8 (always v*sible) |
| 5k – 50k      * 10 |
| 50k – 500k    | 11 |
| 500* – 2M     | 12 |
| > 2M          * 13+ |

### 8.2 Render as circles *nstead of symbols

For **very** de*se layers, circles are*cartographically appropriate (a sm*ll colored dot) and don't hit the *con atlas limit:*
```sql
UPDATE app.layers
SET styl* = jsonb_set(
  jsonb_set(style, '*point,render_as}', '"circle"'),
  *{point,minzoom}', '13'::jsonb
)
WH*RE name = 'dbo_customer_meter_lvle*evw';
```

The frontend autom*tically switches to a circle layer*when `render_as: "circle"` — circl* radius scales smoothly with zoom.*
Rec*mmended for:
- `dbo_customer_meter*lvle_evw` (1.3M rows)
- `dbo_servi*e_line_lvle*evw` (705K rows)
- `dbo_oh_support*structure_lvle_evw` (593K rows)

-*-

## 9. Legend & Visual Verificat*on

###*9.1 The legend swatches

Every lay*r in the sidebar shows a small*visual swatch derived from its sty*e:

- **Point layers** → tinted SV* icon
- **Line layers** → colored *ash (dashed if `dash` is set)
- ***olygon layers** → filled square wi*h outline

Test after updating a s*yle: refresh the browser, check th* sidebar swatch matches your inten*.

### 9.2 Quick visual check on t*e map

```text
1. Log in
2. Toggle*your new/updated layer
3. Zoom to *here you know features exist*4. Verify:
   - Correct color / vo*tage tint
   - Correct icon (point*)*   - Correct dash pattern (lines)
*  - Sensible opacity (polygons don*t obscure basemap)
```

### 9.3 If*nothing renders

Check the browser*console. Common causes:

| Symptom*| Cause | Fix |
|---------|-------*-----|
| `Image X*could not be loaded` | Icon name n*t in registry | Check `apps/web/sr*/features/map/icons.ts` |
| Lay*r toggles but map stays blank | Zo*m out of data extent | Use Z*om-to-layer button in sidebar |
| *arning: "Too many glyphs..." | Den*e point*layer at low zoom | Add `minzoom` *r switch to `render_as: "circle"` *
| Console flooded with `sty*eimagemissing` | Sprite loader rac* condition | Hard-refresh (Ctrl*Shift-R) |

---

## 10. Common Mis*akes

### Forgetting to restart Ma*tin*
Martin discovers tables at startu*. New tables **won't appear** as t*le sources until you:

```b*sh
make infra-restart
```

### Wro*g table_name / name mismatch

`app*layers.name` and `app.layers.table**ame` should almost always be ident*cal for dbo layers. Mismatches bre*k t*le URL generation.

### Missing pr*mary key

Without `PRIMARY KEY (og*_fid)`:*- Martin can't emit a stable featu*e ID
- Feature clicks in the front*nd don't work
- Edit*ng is broken

Always confirm:

```*ql
SELECT constraint_type
FROM inf*rmation_schema.*able_constraints
WHERE table_schem* = 'dbo' AND table_name = 'dbo_you*_layer_evw';
```

Should include*`PRIMARY KEY`.

### Wrong SRID

Th* app assumes SRID 4326 (WGS84 lat/*on). Import with `-t_srs EPSG:4326* in*ogr2ogr or fix afterwards:

```sql*ALTER TABLE d*o.dbo_your_layer_evw
  ALTER COLUM* the_geom TYPE geometry(Geometry, *326)
  USING ST_*ransform(the_geom, 4326);
```

###*Style JSON has wrong shape

Common*mistake — put*ing keys at the top level instead *f nested:

**Wrong:**

```json
{ "*con": "arrester*, "color": "#0d9488" }
```

**Righ*:**

```json
{ "point": { "icon": *arrester", "color": "#0d9488" } }
*``

The*top level must be one of `point`, *line`, `polygon`.

### Data-driven*color returns wrong values

M*pLibre expressions are case-sensit*ve on attribute values. `"Ashanti"* ≠ `"ashanti"` ≠ `"*SHANTI"`. If in doubt, normalize i* the expression:

```sql
--*Instead of matching literal value:*jsonb_build_array('get', 'region')*

-- Match l*wercase:
jsonb_build_array('downca*e', jsonb_build_array('get', 'regi*n')),
```

### Icon SVG has mult*ple colors

SDF sprites can only t*nt **one** color. Multi-color SVGs*will render as the outermost f*ll color only. If you need real mu*ti-color icons, that requires a di*ferent rendering path (raster PNG *t f*xed size) — not currently supporte*.

### Forgetting to refresh Marti*'s TileJSON

If you*change `tile_url` in `app.layers`,*the browser caches the old value. *ard-refresh (*trl-Shift-R) to pick up the new UR*.

---

## Appendix — Quick Refere*ce

### Get a psql shell

```bash
*ake db-psql-admin
```

### Inspect*a layer's current style

```sql
SE*ECT display*name, style
FROM app.layers
WHERE *ame = 'dbo_your_layer_evw';
```

#*# Reset a layer's style to empty

*``sql
UPDATE app.layers
SET style * '{}'::jsonb
WHERE name = 'dbo_you*_layer_evw';
```

Then rerun `make*db-layers-style` to re-apply the d*fault seed.

### List all icons in*the registry

```bash
cat apps/web*src/features/map/icons.ts | grep -*P 'from "@/assets/symbols/\K[^"]+'*```

### Verify Martin sees a laye*

```bash
curl -s http://localhost:5441/catalog | jq '.tiles | keys' * grep your_layer
```

### Force sp*ite reload (dev)

Hard-refresh the*browser with Ctrl-Shift-R. Vite se*ves fresh SVG imports on next requ*st.

---

## Getting Help

- Check*the Layer registry: `SELECT * FROM*app.layers WHERE name = 'dbo_your_*ayer_evw';`
- Check Martin catalog* `curl http://localhost:5441/catal*g | jq '.tiles | keys'`
- Check ic*n loaded: brow*er console → `__map.hasImage('icon*name')`
- Check tile URL: browser *etwork tab → fil*er for `.mvt`

Happy mapping! 🗺️
*
