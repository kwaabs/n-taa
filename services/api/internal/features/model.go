package features

import "encoding/json"

type Feature struct {
    Type       string          `json:"type"`
    ID         any             `json:"id,omitempty"`
    Geometry   json.RawMessage `json:"geometry"`
    Properties json.RawMessage `json:"properties"`
}

type FeatureCollection struct {
    Type     string    `json:"type"`
    Features []Feature `json:"features"`
}

func NewFeature(id any, geom, props json.RawMessage) Feature {
    if props == nil {
        props = json.RawMessage("{}")
    }
    if geom == nil {
        geom = json.RawMessage("null")
    }
    return Feature{Type: "Feature", ID: id, Geometry: geom, Properties: props}
}

func NewFeatureCollection(fs []Feature) FeatureCollection {
    if fs == nil {
        fs = []Feature{}
    }
    return FeatureCollection{Type: "FeatureCollection", Features: fs}
}
