import { Select, type SelectOption } from "@/components/ui/Select";
import { useMapStore } from "../store/mapStore";
import { BASEMAPS } from "../basemaps/basemaps";

export function BasemapSwitcher() {
  const basemapId = useMapStore((s) => s.basemapId);
  const setBasemap = useMapStore((s) => s.setBasemap);

  const options: SelectOption[] = Object.values(BASEMAPS).map((b) => ({
    value: b.id,
    label: b.label,
    hint: b.unofficial ? "unofficial" : undefined,
  }));

  return (
    <Select
      options={options}
      value={basemapId}
      onChange={(e) => setBasemap(e.target.value)}
      aria-label="Basemap"
    />
  );
}
