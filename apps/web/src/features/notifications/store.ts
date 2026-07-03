import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "progress";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  progress?: number; // 0-100 for progress toasts
  duration?: number; // ms; null/undefined = persistent (until manually dismissed)
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id" | "createdAt">) => string;
  update: (id: string, patch: Partial<Toast>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: (toast) => {
    const id = `toast-${Date.now()}-${counter++}`;
    const newToast: Toast = {
      id,
      createdAt: Date.now(),
      duration: toast.duration ?? (toast.kind === "error" ? 6000 : 4000),
      ...toast,
    };
    set((s) => ({ toasts: [...s.toasts, newToast] }));
    return id;
  },

  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

// ─── Convenience helpers ──────────────────────────────

export function toastSuccess(title: string, description?: string): string {
  return useToastStore.getState().show({ kind: "success", title, description });
}

export function toastError(title: string, description?: string): string {
  return useToastStore
    .getState()
    .show({ kind: "error", title, description, duration: 6000 });
}

export function toastInfo(title: string, description?: string): string {
  return useToastStore.getState().show({ kind: "info", title, description });
}

/**
 * Start a persistent progress toast. Returns the toast id.
 * Update progress with toastUpdateProgress(id, percent).
 * Finalize with toastCompleteProgress(id) or toastFailProgress(id, err).
 */
export function toastProgress(title: string, description?: string): string {
  return useToastStore.getState().show({
    kind: "progress",
    title,
    description,
    progress: 0,
    duration: undefined, // persistent
  });
}

export function toastUpdateProgress(
  id: string,
  progress: number,
  description?: string,
) {
  useToastStore
    .getState()
    .update(id, {
      progress: Math.max(0, Math.min(100, progress)),
      description,
    });
}

export function toastCompleteProgress(
  id: string,
  title?: string,
  description?: string,
) {
  useToastStore.getState().update(id, {
    kind: "success",
    progress: 100,
    duration: 3000,
    ...(title && { title }),
    ...(description !== undefined && { description }),
  });
}

export function toastFailProgress(
  id: string,
  title?: string,
  description?: string,
) {
  useToastStore.getState().update(id, {
    kind: "error",
    progress: 0,
    duration: 6000,
    ...(title && { title }),
    ...(description !== undefined && { description }),
  });
}
