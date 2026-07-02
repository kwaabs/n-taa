package layers

import (
    "time"

    "github.com/google/uuid"
    "github.com/uptrace/bun"
)

type Layer struct {
    bun.BaseModel `bun:"table:app.layers,alias:l"`

    ID             uuid.UUID `bun:"id,pk,type:uuid,default:gen_random_uuid()"`
    Name           string    `bun:"name,notnull"`
    DisplayName    string    `bun:"display_name,notnull"`
    SchemaName     string    `bun:"schema_name,notnull"`
    TableName      string    `bun:"table_name,notnull"`
    IDColumn       string    `bun:"id_column,notnull"`
    GeometryColumn string    `bun:"geometry_column,notnull"`
    GeometryType   string    `bun:"geometry_type,notnull"`
    SRID           int       `bun:"srid,notnull"`
    Editable       bool      `bun:"editable,notnull"`
    Style          any       `bun:"style,type:jsonb"`
    CreatedAt      time.Time `bun:"created_at,notnull,default:now()"`
    UpdatedAt      time.Time `bun:"updated_at,notnull,default:now()"`
}
