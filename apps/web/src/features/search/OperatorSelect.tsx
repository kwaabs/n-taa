import type { FilterOp, FieldType } from "./types";

export const OPS_BY_TYPE: Record<FieldType, { op: FilterOp; label: string }[]> =
  {
    text: [
      { op: "eq", label: "equals" },
      { op: "neq", label: "not equals" },
      { op: "contains", label: "contains" },
      { op: "starts_with", label: "starts with" },
      { op: "in", label: "in list" },
      { op: "is_null", label: "is empty" },
      { op: "is_not_null", label: "is not empty" },
    ],
    number: [
      { op: "eq", label: "=" },
      { op: "neq", label: "≠" },
      { op: "gt", label: ">" },
      { op: "gte", label: "≥" },
      { op: "lt", label: "<" },
      { op: "lte", label: "≤" },
      { op: "between", label: "between" },
      { op: "in", label: "in list" },
      { op: "is_null", label: "is empty" },
      { op: "is_not_null", label: "is not empty" },
    ],
    boolean: [
      { op: "is_true", label: "is true" },
      { op: "is_false", label: "is false" },
      { op: "is_null", label: "is empty" },
      { op: "is_not_null", label: "is not empty" },
    ],
    date: [
      { op: "eq", label: "on" },
      { op: "gt", label: "after" },
      { op: "gte", label: "on/after" },
      { op: "lt", label: "before" },
      { op: "lte", label: "on/before" },
      { op: "between", label: "between" },
      { op: "is_null", label: "is empty" },
      { op: "is_not_null", label: "is not empty" },
    ],
    other: [
      { op: "eq", label: "equals" },
      { op: "is_null", label: "is empty" },
      { op: "is_not_null", label: "is not empty" },
    ],
  };

export const OPS_WITHOUT_VALUE: FilterOp[] = [
  "is_null",
  "is_not_null",
  "is_true",
  "is_false",
];

interface Props {
  type: FieldType;
  value: FilterOp;
  onChange: (op: FilterOp) => void;
}

export function OperatorSelect({ type, value, onChange }: Props) {
  const options = OPS_BY_TYPE[type] ?? OPS_BY_TYPE.other;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FilterOp)}
      className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none hover:bg-slate-50 focus:border-emerald-500"
    >
      {options.map((o) => (
        <option key={o.op} value={o.op}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
