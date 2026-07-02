package db

import (
    "context"

    "github.com/uptrace/bun"
)

type Probe struct{ db *bun.DB }

func NewProbe(db *bun.DB) *Probe { return &Probe{db: db} }

func (p *Probe) TableExists(ctx context.Context, schema, table string) (bool, error) {
    var exists bool
    err := p.db.NewSelect().
        ColumnExpr("EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?)",
            schema, table).
        Scan(ctx, &exists)
    return exists, err
}

func (p *Probe) HasColumn(ctx context.Context, schema, table, column string) (bool, error) {
    var exists bool
    err := p.db.NewSelect().
        ColumnExpr("EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?)",
            schema, table, column).
        Scan(ctx, &exists)
    return exists, err
}
