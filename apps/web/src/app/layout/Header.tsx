import { Menu, Globe2, Printer } from "lucide-react";
import { useLayoutStore } from "./store/layoutStore";
import { BasemapSwitcher } from "@/features/map/components/BasemapSwitcher";
import { UserMenu } from "@/features/auth/UserMenu";
import { usePrintStore } from "@/features/print/store";

import { FlyToInput } from "@/features/map/components/FlyToInput";

export function Header() {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const openPrint = usePrintStore((s) => s.openModal);

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-slate-100 px-3 shadow-sm">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-emerald-100 p-1">
            <Globe2 className="h-4 w-4 text-emerald-700" />
          </div>
          <span className="font-semibold text-slate-800">TAA Geo</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <FlyToInput />
        <button
          onClick={openPrint}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          title="Print or export map"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>

        <BasemapSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
