import { X } from "lucide-react";
import { OperatorSelect } from "./OperatorSelect";
import { ValueInput } from "./ValueInput";
import type { FieldInfo, Filter, FilterOp } from "./types";

interface Props {
  fields: FieldInfo[];
  node: Filter;
  onChange: (next: Filter) => void;
  onRemove: () => void;
}

export function FilterCondition({ fields, node, onChange, onRemove }: Props) {
  const currentField = fields.find((f) => f.name === node.column) ?? fields[0];

  const setColumn = (col: string) => {
    const field = fields.find((f) => f.name === col);
    if (!field) return;
    const defaultOps: Record<string, FilterOp> = {
      text: "eq",
      number: "eq",
      boolean: "is_true",
      date: "eq",
      other: "eq",
    };
    onChange({
      column: col,
      op: defaultOps[field.type] ?? "eq",
      value: undefined,
    });
  };

  return (
    <div className="relative rounded-md bg-slate-50 px-2 py-2 pr-8">
      {/* Remove button — top-right corner */}
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        aria-label="Remove condition"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Column selector — full width, own row */}
      <select
        value={node.column ?? ""}
        onChange={(e) => setColumn(e.target.value)}
        className="mb-1.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none hover:bg-slate-50 focus:border-emerald-500"
        title={node.column}
      >
        {fields.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Operator + Value — wrap-friendly row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <OperatorSelect
          type={currentField?.type ?? "other"}
          value={(node.op as FilterOp) ?? "eq"}
          onChange={(op) => onChange({ ...node, op, value: undefined })}
        />

        <div className="min-w-0 flex-1">
          <ValueInput
            field={
              currentField ?? {
                name: node.column ?? "",
                type: "text",
                nullable: true,
              }
            }
            op={(node.op as FilterOp) ?? "eq"}
            value={node.value}
            onChange={(v) => onChange({ ...node, value: v })}
          />
        </div>
      </div>
    </div>
  );
}
