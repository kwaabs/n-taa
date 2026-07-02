import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> {
  options: SelectOption[];
}

export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <div className="relative inline-block">
      <select
        {...rest}
        className={[
          "appearance-none rounded-md border border-slate-200 bg-white",
          "py-1 pl-2.5 pr-7 text-sm text-slate-700",
          "outline-none focus:border-emerald-500",
          "hover:bg-slate-50",
          className ?? "",
        ].join(" ")}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.hint ? `  (${opt.hint})` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}
