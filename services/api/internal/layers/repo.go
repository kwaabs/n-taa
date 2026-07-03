package layers

import (
    "context"
    "database/sql"
"fmt"
    "encoding/json"

    "errors"

    "github.com/google/uuid"
    "github.com/uptrace/bun"
)

type Repo struct{ db *bun.DB }

func NewRepo(db *bun.DB) *Repo { return &Repo{db: db} }

func (r *Repo) List(ctx context.Context) ([]Layer, error) {
    var layers []Layer
    err := r.db.NewSelect().Model(&layers).Order("display_name ASC").Scan(ctx)
    return layers, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Layer, error) {
    l := new(Layer)
    err := r.db.NewSelect().Model(l).Where("id = ?", id).Scan(ctx)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return l, nil
}

func (r *Repo) Create(ctx context.Context, l *Layer) error {
    _, err := r.db.NewInsert().Model(l).Returning("*").Exec(ctx)
    return err
}

func (r *Repo) Update(ctx context.Context, l *Layer) error {
    _, err := r.db.NewUpdate().Model(l).
        Column("display_name", "style", "editable").
        WherePK().
        Returning("*").
        Exec(ctx)
    return err
}

// UpdatePermissions writes only the permissions column for a layer.
func (r *Repo) UpdatePermissions(ctx context.Context, l *Layer) error {
    fmt.Printf("[DEBUG] UpdatePermissions called for id=%s\n", l.ID)

    permsJSON, err := json.Marshal(l.Permissions)
    if err != nil {
        fmt.Printf("[DEBUG] json marshal failed: %v\n", err)
        return err
    }

    fmt.Printf("[DEBUG] about to run UPDATE with json=%s\n", string(permsJSON))

    res, err := r.db.ExecContext(ctx,
        `UPDATE app.layers SET permissions = ?::jsonb WHERE id = ?`,
        string(permsJSON), l.ID,
    )
    if err != nil {
        fmt.Printf("[DEBUG] ExecContext returned error: %v\n", err)
        return err
    }

    rows, _ := res.RowsAffected()
    fmt.Printf("[DEBUG] UPDATE finished, rows affected: %d\n", rows)
    return nil
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
    _, err := r.db.NewDelete().Model((*Layer)(nil)).Where("id = ?", id).Exec(ctx)
    return err
}
