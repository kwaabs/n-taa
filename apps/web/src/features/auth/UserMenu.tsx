import { useEffect, useRef, useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { useAuthStore } from "./store";
import { useLogout } from "./hooks";
import type { User } from "./types";

/**
 * Extracts up-to-two initials from a user's display name.
 * "Super Admin"     → "SA"
 * "Justice Danso"   → "JD"
 * "Kwame"           → "K"
 * "" or null        → "?"
 */
function initialsFrom(user: User | null): string {
  if (!user?.display_name) return "?";
  const parts = user.display_name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toUpperCase();
}

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const initials = initialsFrom(user);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-full transition hover:ring-2 hover:ring-emerald-200"
        aria-label="User menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
          {initials}
        </span>
        <ChevronDown
          className={[
            "h-3 w-3 text-slate-500 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {user.display_name}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {user.email}
                </div>
                <div className="mt-0.5 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  {user.role}
                </div>
              </div>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                logout.mutate();
              }}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 text-slate-500" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
