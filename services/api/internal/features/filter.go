package features

import (
    "encoding/json"
    "fmt"
    "strings"
)

// Filter is the recursive AST. Either a Group (op + conditions) or a Condition
// (column + op + value). We use a hybrid struct because Go doesn't have unions;
// the shape determines what's used.
type Filter struct {
    // Group fields (used when Conditions is non-empty)
    Op         string   `json:"op,omitempty"`         // "and" | "or" for groups; leaf ops for conditions
    Conditions []Filter `json:"conditions,omitempty"` // nested filters

    // Condition fields (used when Column is set)
    Column string          `json:"column,omitempty"`
    Value  json.RawMessage `json:"value,omitempty"`
}

// IsGroup — this node combines nested conditions.
func (f Filter) IsGroup() bool {
    return f.Column == "" && (f.Op == "and" || f.Op == "or")
}

// IsCondition — this node applies a column op.
func (f Filter) IsCondition() bool {
    return f.Column != ""
}

// AllowedOps whitelists what we support. Extend as needed.
var AllowedOps = map[string]bool{
    "eq":          true,
    "neq":         true,
    "lt":          true,
    "lte":         true,
    "gt":          true,
    "gte":         true,
    "contains":    true,
    "starts_with": true,
    "in":          true,
    "between":     true,
    "is_null":     true,
    "is_not_null": true,
    "is_true":     true,
    "is_false":    true,
}

// FilterCompiler converts a Filter AST to a parameterized SQL fragment.
// Column names are validated against the layer's real columns to prevent
// injection. Values become bound parameters — no string interpolation.
type FilterCompiler struct {
    validCols map[string]struct{} // column names allowed for this layer
    args      []any               // accumulated bind args
    nextArg   int                 // 1-based, we return "?" placeholders
}

// NewFilterCompiler with a whitelist of column names.
func NewFilterCompiler(validCols []string) *FilterCompiler {
    m := make(map[string]struct{}, len(validCols))
    for _, c := range validCols {
        m[c] = struct{}{}
    }
    return &FilterCompiler{validCols: m}
}

// Compile returns (sql_fragment, args, error).
// The fragment is either "" (no filter), or a parenthesized boolean expression
// suitable to drop into "WHERE ... AND (fragment)".
func (fc *FilterCompiler) Compile(f Filter) (string, []any, error) {
    if f.Op == "" && f.Column == "" {
        return "", nil, nil
    }
    sql, err := fc.compileNode(f)
    if err != nil {
        return "", nil, err
    }
    return sql, fc.args, nil
}

func (fc *FilterCompiler) compileNode(f Filter) (string, error) {
    if f.IsGroup() {
        return fc.compileGroup(f)
    }
    if f.IsCondition() {
        return fc.compileCondition(f)
    }
    return "", fmt.Errorf("filter node is neither group nor condition")
}

func (fc *FilterCompiler) compileGroup(f Filter) (string, error) {
    if len(f.Conditions) == 0 {
        return "", nil
    }
    if f.Op != "and" && f.Op != "or" {
        return "", fmt.Errorf("group op must be 'and' or 'or', got %q", f.Op)
    }

    parts := make([]string, 0, len(f.Conditions))
    for _, c := range f.Conditions {
        sub, err := fc.compileNode(c)
        if err != nil {
            return "", err
        }
        if sub != "" {
            parts = append(parts, sub)
        }
    }
    if len(parts) == 0 {
        return "", nil
    }
    joiner := " AND "
    if f.Op == "or" {
        joiner = " OR "
    }
    return "(" + strings.Join(parts, joiner) + ")", nil
}

func (fc *FilterCompiler) compileCondition(f Filter) (string, error) {
    if _, ok := fc.validCols[f.Column]; !ok {
        return "", fmt.Errorf("unknown column %q", f.Column)
    }
    if !AllowedOps[f.Op] {
        return "", fmt.Errorf("unknown op %q", f.Op)
    }
    col := quoteIdent(f.Column) // uses helper from repo.go

    switch f.Op {
    case "is_null":
        return col + " IS NULL", nil
    case "is_not_null":
        return col + " IS NOT NULL", nil
    case "is_true":
        return col + " IS TRUE", nil
    case "is_false":
        return col + " IS FALSE", nil
    }

    // Ops that need a value
    if len(f.Value) == 0 {
        return "", fmt.Errorf("op %q requires a value", f.Op)
    }

    switch f.Op {
    case "eq":
        return col + " = " + fc.bind(f.Value), nil
    case "neq":
        return col + " <> " + fc.bind(f.Value), nil
    case "lt":
        return col + " < " + fc.bind(f.Value), nil
    case "lte":
        return col + " <= " + fc.bind(f.Value), nil
    case "gt":
        return col + " > " + fc.bind(f.Value), nil
    case "gte":
        return col + " >= " + fc.bind(f.Value), nil
    case "contains":
        // Assume text — use ILIKE for case-insensitive match
        v, err := jsonToText(f.Value)
        if err != nil {
            return "", err
        }
        return col + " ILIKE " + fc.bind(json.RawMessage(`"%`+escapeLike(v)+`%"`)), nil
    case "starts_with":
        v, err := jsonToText(f.Value)
        if err != nil {
            return "", err
        }
        return col + " ILIKE " + fc.bind(json.RawMessage(`"`+escapeLike(v)+`%"`)), nil
    case "in":
        var arr []any
        if err := json.Unmarshal(f.Value, &arr); err != nil {
            return "", fmt.Errorf("in: value must be array, got %s", f.Value)
        }
        if len(arr) == 0 {
            return "1=0", nil // empty IN → always false
        }
        placeholders := make([]string, len(arr))
        for i, v := range arr {
            raw, _ := json.Marshal(v)
            placeholders[i] = fc.bind(raw)
        }
        return col + " IN (" + strings.Join(placeholders, ", ") + ")", nil
    case "between":
        var arr []any
        if err := json.Unmarshal(f.Value, &arr); err != nil || len(arr) != 2 {
            return "", fmt.Errorf("between: value must be array of 2, got %s", f.Value)
        }
        lo, _ := json.Marshal(arr[0])
        hi, _ := json.Marshal(arr[1])
        return col + " BETWEEN " + fc.bind(lo) + " AND " + fc.bind(hi), nil
    }

    return "", fmt.Errorf("op %q not implemented", f.Op)
}

// bind adds an arg and returns "?" placeholder.
// value should be JSON-encoded; we decode into a Go native.
func (fc *FilterCompiler) bind(value json.RawMessage) string {
    var v any
    if err := json.Unmarshal(value, &v); err != nil {
        // Fall back to raw string
        v = string(value)
    }
    fc.args = append(fc.args, v)
    fc.nextArg++
    return "?"
}

func jsonToText(raw json.RawMessage) (string, error) {
    var s string
    if err := json.Unmarshal(raw, &s); err != nil {
        return "", fmt.Errorf("expected string value, got %s", raw)
    }
    return s, nil
}

func escapeLike(s string) string {
    s = strings.ReplaceAll(s, `\`, `\\`)
    s = strings.ReplaceAll(s, "%", `\%`)
    s = strings.ReplaceAll(s, "_", `\_`)
    return s
}
