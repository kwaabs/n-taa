import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/features/notifications/store";
import type { Layer, LayerPermissions } from "@/features/layers/types";

export function useUpdateLayerPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { layerId: string; perms: LayerPermissions }) =>
      api<Layer>(`/api/v1/layers/${vars.layerId}/permissions`, {
        method: "PATCH",
        body: vars.perms,
      }),
    onSuccess: (layer) => {
      toastSuccess("Permissions updated", layer.display_name);
      qc.invalidateQueries({ queryKey: ["layers"] });
    },
    onError: (err) => {
      toastError(
        "Update failed",
        (err as { message?: string })?.message ?? "Unknown error",
      );
    },
  });
}
