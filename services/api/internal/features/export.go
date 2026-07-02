package features

import (
    "context"
    "encoding/json"
    "io"
    "strconv"
    "time"

    "github.com/xuri/excelize/v2"
)

// ─────────────────────────────────────────────────────────────
// Common exporter interface
// ─────────────────────────────────────────────────────────────

// exporterFn is called once per row.
// After all rows: finalize is called to flush headers/footers/xlsx trailers.
type exporterFn = func(id int64, props json.RawMessage, geom json.RawMessage) error
type finalizerFn = func() error

// ─────────────────────────────────────────────────────────────
// Excel exporter
// ─────────────────────────────────────────────────────────────

// StreamXLSX writes the query results as an Excel workbook to w.
// One sheet named after the layer.
func (s *Service) StreamXLSX(
    ctx context.Context,
    layerID string,
    params ExportCSVParams,
    layerName string,
    w io.Writer,
) error {
    if len(params.Geometry) == 0 {
        return ErrInvalidInput
    }

    layerUUID, err := parseUUID(layerID)
    if err != nil {
        return err
    }
    _, t, err := s.resolve(ctx, layerUUID)
    if err != nil {
        return err
    }

    f := excelize.NewFile()
    defer f.Close()

    sheet := sanitizeSheetName(layerName)
    if sheet == "" {
        sheet = "Data"
    }
    // excelize creates "Sheet1" by default — rename
    if err := f.SetSheetName("Sheet1", sheet); err != nil {
        return err
    }
    idx, err := f.GetSheetIndex(sheet)
    if err != nil {
        return err
    }
    f.SetActiveSheet(idx)

    var (
        headerCols []string
        rowIdx     int = 1 // Excel is 1-indexed; row 1 = header
    )

    // Bold header style
    headerStyle, err := f.NewStyle(&excelize.Style{
        Font: &excelize.Font{Bold: true},
        Fill: excelize.Fill{
            Type:    "pattern",
            Color:   []string{"#F1F5F9"}, // slate-100
            Pattern: 1,
        },
    })
    if err != nil {
        return err
    }

    err = s.repo.StreamByGeometry(ctx, t, params.Geometry, params.Filters, params.Sort,
        func(id int64, propsRaw json.RawMessage) error {
            var props map[string]any
            if err := json.Unmarshal(propsRaw, &props); err != nil {
                return err
            }

            // First row → build the header
            if rowIdx == 1 {
                if len(params.Columns) > 0 {
                    headerCols = params.Columns
                } else {
                    headerCols = deterministicColumns(props)
                }
                // Write header row
                for i, col := range headerCols {
                    cell, _ := excelize.CoordinatesToCellName(i+1, 1)
                    f.SetCellStr(sheet, cell, humanizeHeader(col))
                }
                lastCell, _ := excelize.CoordinatesToCellName(len(headerCols), 1)
                f.SetCellStyle(sheet, "A1", lastCell, headerStyle)
                // Freeze the header
                f.SetPanes(sheet, &excelize.Panes{
                    Freeze:      true,
                    Split:       false,
                    XSplit:      0,
                    YSplit:      1,
                    TopLeftCell: "A2",
                    ActivePane:  "bottomLeft",
                })
                // Autofilter across the header
                f.AutoFilter(sheet, "A1:"+lastCell, nil)

                rowIdx = 2
            }

            // Write the row
            for i, col := range headerCols {
                cell, _ := excelize.CoordinatesToCellName(i+1, rowIdx)
                if col == "ogc_fid" {
                	f.SetCellInt(sheet, cell, id)
                    continue
                }
                setXLSXValue(f, sheet, cell, props[col])
            }
            rowIdx++
            return nil
        })
    if err != nil {
        return err
    }

    // Auto-fit column widths (approximate — excelize doesn't have real autofit)
    for i := range headerCols {
        colName, _ := excelize.ColumnNumberToName(i + 1)
        f.SetColWidth(sheet, colName, colName, 16)
    }

    return f.Write(w)
}

func setXLSXValue(f *excelize.File, sheet, cell string, v any) {
    if v == nil {
        return
    }
    switch x := v.(type) {
    case string:
        f.SetCellStr(sheet, cell, x)
    case bool:
        f.SetCellBool(sheet, cell, x)
    case float64:
        if x == float64(int64(x)) {
        	f.SetCellInt(sheet, cell, int64(x))
        } else {
            f.SetCellFloat(sheet, cell, x, 4, 64)
        }
    case json.Number:
        if n, err := x.Int64(); err == nil {
        	f.SetCellInt(sheet, cell, n)
        } else if fn, err := x.Float64(); err == nil {
            f.SetCellFloat(sheet, cell, fn, 4, 64)
        } else {
            f.SetCellStr(sheet, cell, x.String())
        }
    default:
        b, err := json.Marshal(v)
        if err == nil {
            f.SetCellStr(sheet, cell, string(b))
        }
    }
}

func humanizeHeader(k string) string {
    // Excel header casing: leave as-is, users can rename
    return k
}

// sanitizeSheetName strips characters Excel won't accept.
func sanitizeSheetName(name string) string {
    forbidden := `\/?*[]:`
    out := make([]rune, 0, len(name))
    for _, r := range name {
        if !runeIn(r, forbidden) {
            out = append(out, r)
        }
    }
    s := string(out)
    if len(s) > 31 {
        s = s[:31]
    }
    return s
}

func runeIn(r rune, set string) bool {
    for _, s := range set {
        if s == r {
            return true
        }
    }
    return false
}

// ─────────────────────────────────────────────────────────────
// GeoJSON exporter
// ─────────────────────────────────────────────────────────────

// StreamGeoJSON writes results as a valid GeoJSON FeatureCollection.
// Streams row-by-row (comma-separated features between opening and closing).
func (s *Service) StreamGeoJSON(
    ctx context.Context,
    layerID string,
    params ExportCSVParams,
    w io.Writer,
) error {
    if len(params.Geometry) == 0 {
        return ErrInvalidInput
    }

    layerUUID, err := parseUUID(layerID)
    if err != nil {
        return err
    }
    _, t, err := s.resolve(ctx, layerUUID)
    if err != nil {
        return err
    }

    if _, err := io.WriteString(w, `{"type":"FeatureCollection","generated":"`+
        time.Now().UTC().Format(time.RFC3339)+`","features":[`); err != nil {
        return err
    }

    first := true

    err = s.repo.StreamByGeometryWithGeom(ctx, t, params.Geometry, params.Filters, params.Sort,
        func(id int64, propsRaw json.RawMessage, geomRaw json.RawMessage) error {
            if !first {
                if _, err := io.WriteString(w, ","); err != nil {
                    return err
                }
            }
            first = false

            // Compose the feature
            // { "type": "Feature", "id": <id>, "geometry": <geom>, "properties": <props> }
            buf := make([]byte, 0, 512)
            buf = append(buf, `{"type":"Feature","id":`...)
            buf = strconv.AppendInt(buf, id, 10)
            buf = append(buf, `,"geometry":`...)
            if len(geomRaw) == 0 {
                buf = append(buf, "null"...)
            } else {
                buf = append(buf, geomRaw...)
            }
            buf = append(buf, `,"properties":`...)
            if len(propsRaw) == 0 {
                buf = append(buf, "{}"...)
            } else {
                buf = append(buf, propsRaw...)
            }
            buf = append(buf, '}')
            _, err := w.Write(buf)
            return err
        })
    if err != nil {
        return err
    }

    _, err = io.WriteString(w, `]}`)
    return err
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

func deterministicColumns(props map[string]any) []string {
    cols := make([]string, 0, len(props)+1)
    cols = append(cols, "ogc_fid")
    keys := make([]string, 0, len(props))
    for k := range props {
        keys = append(keys, k)
    }
    // Sort alphabetically for stable output
    sortStrings(keys)
    cols = append(cols, keys...)
    return cols
}

func sortStrings(s []string) {
    // tiny insertion sort to avoid importing "sort" here (already imported elsewhere)
    for i := 1; i < len(s); i++ {
        for j := i; j > 0 && s[j-1] > s[j]; j-- {
            s[j-1], s[j] = s[j], s[j-1]
        }
    }
}

func parseUUID(s string) (uuidLike, error) {
    // Wrap uuid.Parse — keeping the export.go file free of extra imports.
    return uuidFromString(s)
}
