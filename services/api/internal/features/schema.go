package features

import (
    "context"



    "database/sql"      // ← NEW
        "strconv"           // ← NEW


    "github.com/uptrace/bun"
)

// FieldInfo describes one column for the frontend filter builder.
type FieldInfo struct {
    Name           string   `json:"name"`
    Type           string   `json:"type"`            // "text" | "number" | "boolean" | "date" | "other"
    Nullable       bool     `json:"nullable"`
    DistinctValues []string `json:"distinct_values,omitempty"` // for low-cardinality text
}

const distinctValuesThreshold = 20

func (r *Repo) SchemaFor(ctx context.Context, t TableSpec) ([]FieldInfo, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT column_name, data_type, is_nullable
         FROM   information_schema.columns
         WHERE  table_schema = ? AND table_name = ?
         ORDER  BY ordinal_position`,
        t.Schema, t.Table,
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var out []FieldInfo
    for rows.Next() {
        var name, dataType, isNullable string
        if err := rows.Scan(&name, &dataType, &isNullable); err != nil {
            return nil, err
        }
        // Skip internal columns from the filter UI
        if name == t.IDColumn || name == t.GeomColumn {
            continue
        }
        fi := FieldInfo{
            Name:     name,
            Type:     classifyType(dataType),
            Nullable: isNullable == "YES",
        }
        // Try to fetch distinct values for text columns
        if fi.Type == "text" {
            fi.DistinctValues = tryDistinctValues(ctx, r.db, t, name)
        }
        out = append(out, fi)
    }
    return out, rows.Err()
}

func classifyType(pgType string) string {
    switch pgType {
    case "character varying", "text", "varchar", "citext", "character":
        return "text"
    case "integer", "bigint", "smallint", "numeric", "real", "double precision":
        return "number"
    case "boolean":
        return "boolean"
    case "date", "timestamp with time zone", "timestamp without time zone", "timestamptz":
        return "date"
    }
    return "other"
}

// tryDistinctValues returns up to `distinctValuesThreshold` values.
// If there are more, returns nil (frontend falls back to text input).
// tryDistinctValues returns up to `distinctValuesThreshold` values.
// If there are more, returns nil (frontend falls back to text input).
func tryDistinctValues(ctx context.Context, db *bun.DB, t TableSpec, col string) []string {
    q := `SELECT DISTINCT ` + quoteIdent(col) +
        ` FROM ` + t.Qualified() +
        ` WHERE ` + quoteIdent(col) + ` IS NOT NULL` +
        ` ORDER BY 1` +
        ` LIMIT ` + strconv.Itoa(distinctValuesThreshold+1)

    rows, err := db.QueryContext(ctx, q)
    if err != nil {
        return nil
    }
    defer rows.Close()

    var vals []string
    for rows.Next() {
        // Scan directly to string; NULLs already filtered by WHERE
        var s sql.NullString
        if err := rows.Scan(&s); err != nil {
            return nil
        }
        if s.Valid {
            vals = append(vals, s.String)
        }
    }
    if len(vals) > distinctValuesThreshold {
        return nil // too many, don't emit
    }
    return vals
}
