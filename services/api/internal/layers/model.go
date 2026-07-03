package layers

import (
    "database/sql/driver"
    "encoding/json"
    "errors"
    "time"

    "github.com/google/uuid"
    "github.com/uptrace/bun"
)

type LayerPermissions struct {
    ViewRoles   []string `json:"view_roles"`
    ExportRoles []string `json:"export_roles"`
}

// Value implements driver.Valuer for jsonb storage.
func (p LayerPermissions) Value() (driver.Value, error) {
    return json.Marshal(p)
}

// Scan implements sql.Scanner for jsonb reads.
func (p *LayerPermissions) Scan(value any) error {
    if value == nil {
        return nil
    }
    var data []byte
    switch v := value.(type) {
    case []byte:
        data = v
    case string:
        data = []byte(v)
    default:
        return errors.New("layer permissions: unsupported scan type")
    }
    return json.Unmarshal(data, p)
}

type Layer struct {
    bun.BaseModel `bun:"table:app.layers,alias:l"`

    ID             uuid.UUID        `bun:"id,pk,type:uuid,default:gen_random_uuid()"`
    Name           string           `bun:"name,notnull"`
    DisplayName    string           `bun:"display_name,notnull"`
    SchemaName     string           `bun:"schema_name,notnull"`
    TableName      string           `bun:"table_name,notnull"`
    IDColumn       string           `bun:"id_column,notnull"`
    GeometryColumn string           `bun:"geometry_column,notnull"`
    GeometryType   string           `bun:"geometry_type,notnull"`
    SRID           int              `bun:"srid,notnull"`
    Editable       bool             `bun:"editable,notnull"`
    Style          any              `bun:"style,type:jsonb"`
    Permissions    LayerPermissions `bun:"permissions,type:jsonb"`
    CreatedAt      time.Time        `bun:"created_at,notnull,default:now()"`
    UpdatedAt      time.Time        `bun:"updated_at,notnull,default:now()"`
}
