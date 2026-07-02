package layers

import (
    "context"
    "errors"
    "strings"

    "github.com/google/uuid"
)

var (
    ErrNotFound        = errors.New("layer not found")
    ErrInvalidInput    = errors.New("invalid input")
    ErrDuplicate       = errors.New("layer already exists")
    ErrPhysicalMissing = errors.New("physical table not found")
)

type RawTableProbe interface {
    TableExists(ctx context.Context, schema, table string) (bool, error)
    HasColumn(ctx context.Context, schema, table, column string) (bool, error)
}

type Service struct {
    repo  *Repo
    probe RawTableProbe
}

func NewService(repo *Repo, probe RawTableProbe) *Service {
    return &Service{repo: repo, probe: probe}
}

func (s *Service) List(ctx context.Context) ([]Layer, error) {
    return s.repo.List(ctx)
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (*Layer, error) {
    l, err := s.repo.Get(ctx, id)
    if err != nil {
        return nil, err
    }
    if l == nil {
        return nil, ErrNotFound
    }
    return l, nil
}

type CreateInput struct {
    Name           string
    DisplayName    string
    SchemaName     string
    TableName      string
    IDColumn       string
    GeometryColumn string
    GeometryType   string
    SRID           int
    Editable       bool
    Style          any
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*Layer, error) {
    if in.SchemaName == "" {
        in.SchemaName = "dbo"
    }
    if in.IDColumn == "" {
        in.IDColumn = "ogc_fid"
    }
    if in.GeometryColumn == "" {
        in.GeometryColumn = "the_geom"
    }
    if in.GeometryType == "" {
        in.GeometryType = "Geometry"
    }
    if in.SRID == 0 {
        in.SRID = 4326
    }
    if strings.TrimSpace(in.Name) == "" ||
        strings.TrimSpace(in.DisplayName) == "" ||
        strings.TrimSpace(in.TableName) == "" {
        return nil, ErrInvalidInput
    }

    ok, err := s.probe.TableExists(ctx, in.SchemaName, in.TableName)
    if err != nil {
        return nil, err
    }
    if !ok {
        return nil, ErrPhysicalMissing
    }
    for _, col := range []string{in.IDColumn, in.GeometryColumn} {
        has, err := s.probe.HasColumn(ctx, in.SchemaName, in.TableName, col)
        if err != nil {
            return nil, err
        }
        if !has {
            return nil, ErrInvalidInput
        }
    }

    l := &Layer{
        Name:           in.Name,
        DisplayName:    in.DisplayName,
        SchemaName:     in.SchemaName,
        TableName:      in.TableName,
        IDColumn:       in.IDColumn,
        GeometryColumn: in.GeometryColumn,
        GeometryType:   in.GeometryType,
        SRID:           in.SRID,
        Editable:       in.Editable,
        Style:          in.Style,
    }
    if err := s.repo.Create(ctx, l); err != nil {
        msg := strings.ToLower(err.Error())
        if strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique") {
            return nil, ErrDuplicate
        }
        return nil, err
    }
    return l, nil
}

type UpdateInput struct {
    DisplayName *string
    Editable    *bool
    Style       any
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Layer, error) {
    l, err := s.repo.Get(ctx, id)
    if err != nil {
        return nil, err
    }
    if l == nil {
        return nil, ErrNotFound
    }
    if in.DisplayName != nil {
        if strings.TrimSpace(*in.DisplayName) == "" {
            return nil, ErrInvalidInput
        }
        l.DisplayName = *in.DisplayName
    }
    if in.Editable != nil {
        l.Editable = *in.Editable
    }
    if in.Style != nil {
        l.Style = in.Style
    }
    if err := s.repo.Update(ctx, l); err != nil {
        return nil, err
    }
    return l, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
    l, err := s.repo.Get(ctx, id)
    if err != nil {
        return err
    }
    if l == nil {
        return ErrNotFound
    }
    return s.repo.Delete(ctx, id)
}
