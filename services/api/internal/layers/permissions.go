package layers

// CanView returns true if the given role can view this layer.
// Superusers always have view access.
func (l *Layer) CanView(role string) bool {
    if role == "superuser" {
        return true
    }
    for _, r := range l.Permissions.ViewRoles {
        if r == role {
            return true
        }
    }
    return false
}

// CanExport returns true if the given role can export this layer.
// Superusers always have export access.
func (l *Layer) CanExport(role string) bool {
    if role == "superuser" {
        return true
    }
    for _, r := range l.Permissions.ExportRoles {
        if r == role {
            return true
        }
    }
    return false
}
