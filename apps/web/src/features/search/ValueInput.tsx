import type { FieldInfo, FilterOp } from "./types";
import { OPS_WITHOUT_VALUE } from "./OperatorSelect";

interface Props {
  field: FieldInfo;
  op: FilterOp;
  value: unknown;
  onChange: (v: unknown) => void;
}

const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-emerald-500";

export function ValueInput({ field, op, value, onChange }: Props) {
  if (OPS_WITHOUT_VALUE.includes(op)) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (op === "between") {
    const [lo, hi] = Array.isArray(value) ? value : [null, null];
    const isNum = field.type === "number";
    return (
      <div className="flex w-full items-center gap-1">
        <input
          type={isNum ? "number" : "text"}
          value={lo ?? ""}
          onChange={(e) =>
            onChange([isNum ? Number(e.target.value) : e.target.value, hi])
          }
          placeholder="from"
          className={inputCls}
        />
        <span className="text-xs text-slate-400">–</span>
        <input
          type={isNum ? "number" : "text"}
          value={hi ?? ""}
          onChange={(e) =>
            onChange([lo, isNum ? Number(e.target.value) : e.target.value])
          }
          placeholder="to"
          className={inputCls}
        />
      </div>
    );
  }

  if (op === "in") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <input
        type="text"
        value={arr.join(", ")}
        onChange={(e) => {
          const parts = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(field.type === "number" ? parts.map(Number) : parts);
        }}
        placeholder="a, b, c"
        className={inputCls}
      />
    );
  }

  if (
    field.type === "text" &&
    field.distinct_values &&
    field.distinct_values.length > 0
  ) {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">— pick —</option>
        {field.distinct_values.map((v) => (
          <option key={v} value={v}>
            {v === " " ? "(blank)" : v}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      />
    );
  }

  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}
