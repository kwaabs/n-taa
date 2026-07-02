
package features



import (

    "context"

    "database/sql"

    "encoding/base64"

    "encoding/json"

    "errors"

    "fmt"

    "strings"



    "github.com/uptrace/bun"

)



// ─────────────────────────────────────────────────────────────

// Constants

// ─────────────────────────────────────────────────────────────



const (

    MaxPageSize         = 500

    DefaultPageSize     = 100

    MaxHighlightLimit   = 5000

    ExactCountThreshold = 100_000

)



// ─────────────────────────────────────────────────────────────

// Types

// ─────────────────────────────────────────────────────────────



type TableSpec struct {

    Schema     string

    Table      string

    IDColumn   string

    GeomColumn string

    SRID       int

}



func (t TableSpec) Qualified() string {

    return quoteIdent(t.Schema) + "." + quoteIdent(t.Table)

}

func (t TableSpec) IDCol() string          { return quoteIdent(t.IDColumn) }

func (t TableSpec) GeomCol() string        { return quoteIdent(t.GeomColumn) }

func (t TableSpec) Col(name string) string { return quoteIdent(name) }



type PageParams struct {

    Geometry json.RawMessage


    Filters  *Filter          // ← NEW (optional)


    Sort     []SortField

    Cursor   string

    Limit    int

}



type PageResult struct {

    Features   []Feature

    NextCursor string

}



type cursorPayload struct {

    V  any   `json:"v,omitempty"`

    ID int64 `json:"id"`

}



// ─────────────────────────────────────────────────────────────

// Repo

// ─────────────────────────────────────────────────────────────



type Repo struct{ db *bun.DB }



func NewRepo(db *bun.DB) *Repo { return &Repo{db: db} }



// ─── READ ─────────────────────────────────────────────



func (r *Repo) Count(ctx context.Context, t TableSpec) (int64, error) {

    var n int64

    err := r.db.NewRaw("SELECT count(*) FROM " + t.Qualified()).Scan(ctx, &n)

    return n, err

}



func (r *Repo) GetByID(ctx context.Context, t TableSpec, id int64) (json.RawMessage, json.RawMessage, error) {

    q := fmt.Sprintf(`

        SELECT %s

        FROM   %s x

        WHERE  x.%s = ?

        LIMIT  1`,

        projectGeomAndProps(t),

        t.Qualified(),

        t.IDCol(),

    )

    var geom, props json.RawMessage

    err := r.db.QueryRowContext(ctx, q, id).Scan(&geom, &props)

    if err != nil {

        if errors.Is(err, sql.ErrNoRows) {

            return nil, nil, nil

        }

        return nil, nil, err

    }

    return geom, props, nil

}



func (r *Repo) ListByBBox(ctx context.Context, t TableSpec, bbox *[4]float64, limit int) ([]Feature, error) {

    limit = clampLimit(limit, 100, 1000)

    where, args := bboxWhere(t, bbox)

    q := fmt.Sprintf(`

        SELECT %s

        FROM   %s x

        %s

        ORDER  BY x.%s

        LIMIT  %d`,

        projectIDGeomProps(t),

        t.Qualified(),

        where,

        t.IDCol(),

        limit,

    )

    return scanFeatures(ctx, r.db, q, args)

}



// ─── SPATIAL (one-shot highlight path) ────────────────


func (r *Repo) CountByGeometry(ctx context.Context, t TableSpec, geometry json.RawMessage, filter *Filter) (int64, error) {
    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, filter)
    if err != nil {
        return 0, err
    }

    q := fmt.Sprintf(`
        SELECT count(*)
        FROM   %s x
        WHERE  %s %s`,
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,
    )

    args := []any{string(geometry)}
    args = append(args, filterArgs...)

    var n int64
    if err := r.db.QueryRowContext(ctx, q, args...).Scan(&n); err != nil {
        return 0, err
    }
    return n, nil
}


func (r *Repo) ListByGeometry(ctx context.Context, t TableSpec, geometry json.RawMessage, filter *Filter, limit int) ([]Feature, error) {
    limit = clampLimit(limit, 1000, MaxHighlightLimit)

    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, filter)
    if err != nil {
        return nil, err
    }

    q := fmt.Sprintf(`
        SELECT %s
        FROM   %s x
        WHERE  %s %s
        ORDER  BY x.%s
        LIMIT  %d`,
        projectIDGeomProps(t),
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,
        t.IDCol(),
        limit,
    )

    args := []any{string(geometry)}
    args = append(args, filterArgs...)

    return scanFeatures(ctx, r.db, q, args)
}



// ─── PAGINATION ───────────────────────────────────────


func (r *Repo) PageByGeometry(ctx context.Context, t TableSpec, p PageParams) (PageResult, error) {
    limit := clampLimit(p.Limit, DefaultPageSize, MaxPageSize)

    sortCol, sortDir, hasSort := resolveSort(t, p.Sort)
    orderBy := buildOrderBy(t, sortCol, sortDir, hasSort)

    cursorPred, cursorArgs, err := buildCursorPredicate(t, p.Cursor, sortCol, sortDir, hasSort)
    if err != nil {
        return PageResult{}, err
    }

    // NEW — attribute filter
    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, p.Filters)
    if err != nil {
        return PageResult{}, err
    }

    q := fmt.Sprintf(`
        SELECT %s, x.%s AS __sort_val
        FROM   %s x
        WHERE  %s %s %s
        ORDER  BY %s
        LIMIT  %d`,
        projectIDGeomProps(t),
        quoteIdent(sortCol),
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,      // ← inject filter here (space-prefixed with "AND" already)
        cursorPred,
        orderBy,
        limit+1,
    )

    args := []any{string(p.Geometry)}
    args = append(args, filterArgs...) // ← filter args come after geometry
    args = append(args, cursorArgs...)

    feats, sortVals, err := scanFeaturesWithSortVal(ctx, r.db, q, args)
    if err != nil {
        return PageResult{}, err
    }

    next := ""
    if len(feats) > limit {
        feats = feats[:limit]
        sortVals = sortVals[:limit]
        next = buildNextCursor(feats, sortVals, hasSort)
    }
    return PageResult{Features: feats, NextCursor: next}, nil
}


func (r *Repo) CountForPagination(ctx context.Context, t TableSpec, geometry json.RawMessage, filter *Filter) (int64, bool, error) {
    tableSize, err := r.estimatedTableRows(ctx, t)
    if err != nil {
        return 0, false, err
    }
    if tableSize < ExactCountThreshold {
        exact, err := r.CountByGeometry(ctx, t, geometry, filter)   // ← was 3 args
        return exact, false, err
    }
    approx, err := r.approximateCountByGeometry(ctx, t, geometry, filter)
    if err != nil {
        exact, err := r.CountByGeometry(ctx, t, geometry, filter)   // ← was 3 args
        return exact, false, err
    }
    return approx, true, nil
}



// ─── WRITE ────────────────────────────────────────────



func (r *Repo) Insert(ctx context.Context, t TableSpec, geometry, properties json.RawMessage) (int64, json.RawMessage, json.RawMessage, error) {

    tx, err := r.db.BeginTx(ctx, nil)

    if err != nil {

        return 0, nil, nil, err

    }

    defer tx.Rollback()



    newID, err := insertPropsRow(ctx, tx, t, properties)

    if err != nil {

        return 0, nil, nil, err

    }

    if err := applyGeometry(ctx, tx, t, newID, geometry); err != nil {

        return 0, nil, nil, err

    }

    id, geom, props, err := readbackRow(ctx, tx, t, newID)

    if err != nil {

        return 0, nil, nil, err

    }

    if err := tx.Commit(); err != nil {

        return 0, nil, nil, err

    }

    return id, geom, props, nil

}



func (r *Repo) Update(ctx context.Context, t TableSpec, id int64, geometry, properties json.RawMessage) (json.RawMessage, json.RawMessage, error) {

    if len(properties) == 0 && !hasGeometry(geometry) {

        return nil, nil, fmt.Errorf("nothing to update")

    }



    tx, err := r.db.BeginTx(ctx, nil)

    if err != nil {

        return nil, nil, err

    }

    defer tx.Rollback()



    if err := ensureRowExists(ctx, tx, t, id); err != nil {

        return nil, nil, err

    }

    if len(properties) > 0 {

        if err := updateProps(ctx, tx, r, t, id, properties); err != nil {

            return nil, nil, err

        }

    }

    if err := applyGeometry(ctx, tx, t, id, geometry); err != nil {

        return nil, nil, err

    }

    _, geom, props, err := readbackRow(ctx, tx, t, id)

    if err != nil {

        return nil, nil, err

    }

    if err := tx.Commit(); err != nil {

        return nil, nil, err

    }

    return geom, props, nil

}



func (r *Repo) Delete(ctx context.Context, t TableSpec, id int64) error {

    q := fmt.Sprintf(`DELETE FROM %s WHERE %s = ?`, t.Qualified(), t.IDCol())

    res, err := r.db.ExecContext(ctx, q, id)

    if err != nil {

        return err

    }

    n, err := res.RowsAffected()

    if err != nil {

        return err

    }

    if n == 0 {

        return sql.ErrNoRows

    }

    return nil

}



// ─────────────────────────────────────────────────────────────

// Helpers — SELECT projection

// ─────────────────────────────────────────────────────────────



func projectGeomAndProps(t TableSpec) string {

    return fmt.Sprintf(

        `ST_AsGeoJSON(x.%s, 6, 0)::jsonb AS geometry,

         (to_jsonb(x) - %s - %s)          AS properties`,

        t.GeomCol(),

        sqlLit(t.GeomColumn),

        sqlLit(t.IDColumn),

    )

}



func projectIDGeomProps(t TableSpec) string {

    return fmt.Sprintf(

        `x.%s                                AS id,

         ST_AsGeoJSON(x.%s, 6, 0)::jsonb    AS geometry,

         (to_jsonb(x) - %s - %s)             AS properties`,

        t.IDCol(),

        t.GeomCol(),

        sqlLit(t.GeomColumn),

        sqlLit(t.IDColumn),

    )

}



// ─────────────────────────────────────────────────────────────

// Helpers — WHERE clauses

// ─────────────────────────────────────────────────────────────



func geomIntersectsClause(t TableSpec) string {

    return fmt.Sprintf(

        `ST_Intersects(x.%s, ST_SetSRID(ST_GeomFromGeoJSON(?), %d))`,

        t.GeomCol(), t.SRID,

    )

}



func bboxWhere(t TableSpec, bbox *[4]float64) (string, []any) {

    if bbox == nil {

        return "", nil

    }

    clause := fmt.Sprintf(`WHERE x.%s && ST_MakeEnvelope(?, ?, ?, ?, ?)`, t.GeomCol())

    return clause, []any{bbox[0], bbox[1], bbox[2], bbox[3], t.SRID}

}



// ─────────────────────────────────────────────────────────────

// Helpers — Pagination pieces

// ─────────────────────────────────────────────────────────────



func resolveSort(t TableSpec, sorts []SortField) (col string, dir string, hasCustom bool) {

    col = t.IDColumn

    dir = "ASC"

    if len(sorts) == 0 || sorts[0].Column == "" {

        return col, dir, false

    }

    col = sorts[0].Column

    if strings.EqualFold(sorts[0].Direction, "desc") {

        dir = "DESC"

    }

    return col, dir, true

}



func buildOrderBy(t TableSpec, sortCol, sortDir string, hasSort bool) string {

    if !hasSort {

        return fmt.Sprintf(`x.%s ASC`, t.IDCol())

    }

    return fmt.Sprintf(`x.%s %s, x.%s ASC`, quoteIdent(sortCol), sortDir, t.IDCol())

}



func buildCursorPredicate(t TableSpec, cursor, sortCol, sortDir string, hasSort bool) (string, []any, error) {

    if cursor == "" {

        return "", nil, nil

    }

    c, err := decodeCursor(cursor)

    if err != nil {

        return "", nil, fmt.Errorf("invalid cursor: %w", err)

    }

    if !hasSort {

        return fmt.Sprintf(`AND x.%s > ?`, t.IDCol()), []any{c.ID}, nil

    }

    cmp := ">"

    if sortDir == "DESC" {

        cmp = "<"

    }

    pred := fmt.Sprintf(

        `AND (x.%s, x.%s) %s (?, ?)`,

        quoteIdent(sortCol), t.IDCol(), cmp,

    )

    return pred, []any{c.V, c.ID}, nil

}



func buildNextCursor(feats []Feature, sortVals []any, hasSort bool) string {

    if len(feats) == 0 {

        return ""

    }

    last := feats[len(feats)-1]

    id, _ := last.ID.(int64)

    payload := cursorPayload{ID: id}

    if hasSort {

        payload.V = sortVals[len(sortVals)-1]

    }

    return encodeCursor(payload)

}



func encodeCursor(c cursorPayload) string {

    b, _ := json.Marshal(c)

    return base64.URLEncoding.EncodeToString(b)

}



func decodeCursor(s string) (*cursorPayload, error) {

    b, err := base64.URLEncoding.DecodeString(s)

    if err != nil {

        return nil, err

    }

    var c cursorPayload

    if err := json.Unmarshal(b, &c); err != nil {

        return nil, err

    }

    return &c, nil

}



// ─────────────────────────────────────────────────────────────

// Helpers — Approximate counting

// ─────────────────────────────────────────────────────────────



func (r *Repo) estimatedTableRows(ctx context.Context, t TableSpec) (int64, error) {

    var n int64

    err := r.db.NewRaw(

        `SELECT reltuples::bigint FROM pg_class WHERE oid = ?::regclass`,

        t.Qualified(),

    ).Scan(ctx, &n)

    return n, err

}


func (r *Repo) approximateCountByGeometry(ctx context.Context, t TableSpec, geometry json.RawMessage, filter *Filter) (int64, error) {
    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, filter)
    if err != nil {
        return 0, err
    }

    q := fmt.Sprintf(`
        SELECT (
          count(*) * (
            (SELECT reltuples FROM pg_class WHERE oid = %s::regclass) /
            GREATEST((SELECT count(*) FROM %s TABLESAMPLE SYSTEM (1)), 1)::float
          )
        )::bigint
        FROM   %s TABLESAMPLE SYSTEM (1) x
        WHERE  %s %s`,
        sqlLit(t.Qualified()),
        t.Qualified(),
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,
    )

    args := []any{string(geometry)}
    args = append(args, filterArgs...)

    var n int64
    err = r.db.NewRaw(q, args...).Scan(ctx, &n)
    return n, err
}

// ─────────────────────────────────────────────────────────────

// Helpers — Write plumbing

// ─────────────────────────────────────────────────────────────



func insertPropsRow(ctx context.Context, tx bun.IDB, t TableSpec, properties json.RawMessage) (int64, error) {

    props := "{}"

    if len(properties) > 0 {

        props = string(properties)

    }

    q := fmt.Sprintf(`

        INSERT INTO %s

        SELECT * FROM jsonb_populate_record(NULL::%s, ?::jsonb)

        RETURNING %s`,

        t.Qualified(), t.Qualified(), t.IDCol(),

    )

    var id int64

    if err := tx.QueryRowContext(ctx, q, props).Scan(&id); err != nil {

        return 0, fmt.Errorf("insert row: %w", err)

    }

    return id, nil

}



func applyGeometry(ctx context.Context, tx bun.IDB, t TableSpec, id int64, geometry json.RawMessage) error {

    if !hasGeometry(geometry) {

        return nil

    }

    q := fmt.Sprintf(`

        UPDATE %s

        SET    %s = ST_SetSRID(ST_GeomFromGeoJSON(?), %d)

        WHERE  %s = ?`,

        t.Qualified(), t.GeomCol(), t.SRID, t.IDCol(),

    )

    if _, err := tx.ExecContext(ctx, q, string(geometry), id); err != nil {

        return fmt.Errorf("apply geometry: %w", err)

    }

    return nil

}



func updateProps(ctx context.Context, tx bun.IDB, r *Repo, t TableSpec, id int64, properties json.RawMessage) error {

    cols, err := r.tableColumnList(ctx, tx, t)

    if err != nil {

        return fmt.Errorf("read columns: %w", err)

    }

    if cols == "" {

        return fmt.Errorf("no columns found for %s", t.Qualified())

    }

    q := fmt.Sprintf(`

        UPDATE %s x

        SET    (%s) = (

          SELECT %s FROM jsonb_populate_record(x.*, ?::jsonb)

        )

        WHERE  x.%s = ?`,

        t.Qualified(), cols, cols, t.IDCol(),

    )

    if _, err := tx.ExecContext(ctx, q, string(properties), id); err != nil {

        return fmt.Errorf("update properties: %w", err)

    }

    return nil

}



func ensureRowExists(ctx context.Context, tx bun.IDB, t TableSpec, id int64) error {

    q := fmt.Sprintf(`SELECT EXISTS(SELECT 1 FROM %s WHERE %s = ?)`, t.Qualified(), t.IDCol())

    var exists bool

    if err := tx.QueryRowContext(ctx, q, id).Scan(&exists); err != nil {

        return err

    }

    if !exists {

        return sql.ErrNoRows

    }

    return nil

}



func readbackRow(ctx context.Context, tx bun.IDB, t TableSpec, id int64) (int64, json.RawMessage, json.RawMessage, error) {

    q := fmt.Sprintf(`

        SELECT %s

        FROM   %s x

        WHERE  x.%s = ?`,

        projectIDGeomProps(t),

        t.Qualified(),

        t.IDCol(),

    )

    var outID int64

    var geom, props json.RawMessage

    if err := tx.QueryRowContext(ctx, q, id).Scan(&outID, &geom, &props); err != nil {

        return 0, nil, nil, fmt.Errorf("readback row: %w", err)

    }

    return outID, geom, props, nil

}



func (r *Repo) tableColumnList(ctx context.Context, tx bun.IDB, t TableSpec) (string, error) {

    rows, err := tx.QueryContext(ctx,

        `SELECT column_name

         FROM   information_schema.columns

         WHERE  table_schema = ? AND table_name = ?

         ORDER  BY ordinal_position`,

        t.Schema, t.Table,

    )

    if err != nil {

        return "", err

    }

    defer rows.Close()



    var names []string

    for rows.Next() {

        var n string

        if err := rows.Scan(&n); err != nil {

            return "", err

        }

        names = append(names, quoteIdent(n))

    }

    return strings.Join(names, ", "), rows.Err()

}


// StreamByGeometry executes the same paginated-shaped query without a limit
// and invokes `visit` for each row as it arrives. Used for CSV export.
//
// visit receives (id, properties). Geometry is NOT included in CSV — users
// export attribute data. Return an error from visit to abort.
func (r *Repo) StreamByGeometry(
    ctx context.Context,
    t TableSpec,
    geometry json.RawMessage,
    filter *Filter,
    sort []SortField,
    visit func(id int64, props json.RawMessage) error,
) error {
    sortCol, sortDir, hasSort := resolveSort(t, sort)
    orderBy := buildOrderBy(t, sortCol, sortDir, hasSort)

    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, filter)
    if err != nil {
        return err
    }

    q := fmt.Sprintf(`
        SELECT
          x.%s                       AS id,
          (to_jsonb(x) - %s - %s)    AS properties
        FROM   %s x
        WHERE  %s %s
        ORDER  BY %s`,
        t.IDCol(),
        sqlLit(t.GeomColumn),
        sqlLit(t.IDColumn),
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,
        orderBy,
    )

    args := []any{string(geometry)}
    args = append(args, filterArgs...)

    rows, err := r.db.QueryContext(ctx, q, args...)
    if err != nil {
        return err
    }
    defer rows.Close()

    for rows.Next() {
        if ctx.Err() != nil {
            return ctx.Err()
        }
        var id int64
        var props json.RawMessage
        if err := rows.Scan(&id, &props); err != nil {
            return err
        }
        if err := visit(id, props); err != nil {
            return err
        }
    }
    return rows.Err()
}


// StreamByGeometryWithGeom is like StreamByGeometry but ALSO yields the row's
// geometry as GeoJSON. Used by the GeoJSON exporter.
func (r *Repo) StreamByGeometryWithGeom(
    ctx context.Context,
    t TableSpec,
    geometry json.RawMessage,
    filter *Filter,
    sort []SortField,
    visit func(id int64, props json.RawMessage, geom json.RawMessage) error,
) error {
    sortCol, sortDir, hasSort := resolveSort(t, sort)
    orderBy := buildOrderBy(t, sortCol, sortDir, hasSort)

    filterSQL, filterArgs, err := r.buildAttributeFilter(ctx, t, filter)
    if err != nil {
        return err
    }

    q := fmt.Sprintf(`
        SELECT
          x.%s                              AS id,
          (to_jsonb(x) - %s - %s)           AS properties,
          ST_AsGeoJSON(x.%s, 6, 0)::jsonb   AS geometry
        FROM   %s x
        WHERE  %s %s
        ORDER  BY %s`,
        t.IDCol(),
        sqlLit(t.GeomColumn),
        sqlLit(t.IDColumn),
        t.GeomCol(),
        t.Qualified(),
        geomIntersectsClause(t),
        filterSQL,
        orderBy,
    )

    args := []any{string(geometry)}
    args = append(args, filterArgs...)

    rows, err := r.db.QueryContext(ctx, q, args...)
    if err != nil {
        return err
    }
    defer rows.Close()

    for rows.Next() {
        if ctx.Err() != nil {
            return ctx.Err()
        }
        var id int64
        var props, geom json.RawMessage
        if err := rows.Scan(&id, &props, &geom); err != nil {
            return err
        }
        if err := visit(id, props, geom); err != nil {
            return err
        }
    }
    return rows.Err()
}

// ─────────────────────────────────────────────────────────────

// Helpers — Row scanning

// ─────────────────────────────────────────────────────────────



func scanFeatures(ctx context.Context, db bun.IDB, q string, args []any) ([]Feature, error) {

    rows, err := db.QueryContext(ctx, q, args...)

    if err != nil {

        return nil, err

    }

    defer rows.Close()



    var out []Feature

    for rows.Next() {

        var id int64

        var geom, props json.RawMessage

        if err := rows.Scan(&id, &geom, &props); err != nil {

            return nil, err

        }

        out = append(out, NewFeature(id, geom, props))

    }

    return out, rows.Err()

}



func scanFeaturesWithSortVal(ctx context.Context, db bun.IDB, q string, args []any) ([]Feature, []any, error) {

    rows, err := db.QueryContext(ctx, q, args...)

    if err != nil {

        return nil, nil, err

    }

    defer rows.Close()



    feats := []Feature{}

    sortVals := []any{}

    for rows.Next() {

        var id int64

        var geom, props json.RawMessage

        var sortVal any

        if err := rows.Scan(&id, &geom, &props, &sortVal); err != nil {

            return nil, nil, err

        }

        feats = append(feats, NewFeature(id, geom, props))

        sortVals = append(sortVals, sortVal)

    }

    return feats, sortVals, rows.Err()

}



// ─────────────────────────────────────────────────────────────

// Helpers — Small utilities

// ─────────────────────────────────────────────────────────────



func clampLimit(limit, fallback, max int) int {

    if limit <= 0 {

        return fallback

    }

    if limit > max {

        return max

    }

    return limit

}



func hasGeometry(g json.RawMessage) bool {

    return len(g) > 0 && string(g) != "null"

}



func quoteIdent(name string) string {

    return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`

}



func sqlLit(s string) string {

    return "'" + strings.ReplaceAll(s, "'", "''") + "'"

}


// buildAttributeFilter compiles a Filter against the table's real columns.
// Returns ("", nil, nil) if filter is nil or empty.
func (r *Repo) buildAttributeFilter(
    ctx context.Context,
    t TableSpec,
    filter *Filter,
) (string, []any, error) {
    if filter == nil {
        return "", nil, nil
    }
    if !filter.IsGroup() && !filter.IsCondition() {
        return "", nil, nil
    }

    // Fetch the real column names — we validate against these to prevent injection.
    cols, err := r.listColumnNames(ctx, t)
    if err != nil {
        return "", nil, err
    }

    fc := NewFilterCompiler(cols)
    sql, args, err := fc.Compile(*filter)
    if err != nil {
        return "", nil, fmt.Errorf("compile filter: %w", err)
    }
    if sql == "" {
        return "", nil, nil
    }
    return "AND " + sql, args, nil
}

// listColumnNames returns just the names of all columns in the table.
func (r *Repo) listColumnNames(ctx context.Context, t TableSpec) ([]string, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT column_name
         FROM   information_schema.columns
         WHERE  table_schema = ? AND table_name = ?
         ORDER  BY ordinal_position`,
        t.Schema, t.Table,
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var names []string
    for rows.Next() {
        var n string
        if err := rows.Scan(&n); err != nil {
            return nil, err
        }
        names = append(names, n)
    }
    return names, rows.Err()
}
