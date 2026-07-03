export type PointStyle = {
  icon?: string;
  size?: number;
  color?: string | (string | number | unknown[])[];
  halo_color?: string;
  halo_width?: number;
  opacity?: number;
  minzoom?: number;
  render_as?: "symbol" | "circle";
};

export type LineStyle = {
  color?: string;
  width?: number;
  opacity?: number;
  dash?: number[];
  minzoom?: number;
};

export type PolygonCentroidStyle = {
  enabled?: boolean;
  switch_zoom?: number;
  icon?: string;
  size?: number;
  color?: string;
  halo_color?: string;
  halo_width?: number;
};

export type PolygonStyle = {
  fill_color?: string;
  fill_opacity?: number;
  outline_color?: string;
  outline_width?: number;
  centroid?: PolygonCentroidStyle;
};

export interface LayerStyle {
  point?: PointStyle;
  line?: LineStyle;
  polygon?: PolygonStyle;
}

export interface LayerPermissions {
  view_roles: ("superuser" | "editor" | "viewer")[];
  export_roles: ("superuser" | "editor" | "viewer")[];
}

export interface Layer {
  id: string;
  name: string;
  display_name: string;
  schema_name: string;
  table_name: string;
  id_column: string;
  geometry_column: string;
  geometry_type: string;
  srid: number;
  editable: boolean;
  style: LayerStyle;
  tile_url: string;
  permissions: LayerPermissions;
}
