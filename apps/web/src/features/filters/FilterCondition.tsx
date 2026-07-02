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
    // Reset op + value to sensible defaults for the new type
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
    <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5">
      <select
        value={node.column ?? ""}
        onChange={(e) => setColumn(e.target.value)}
        className="max-w-[110px] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none hover:bg-slate-50 focus:border-emerald-500"
        title={node.column}
      >
        {fields.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>

      <OperatorSelect
        type={currentField?.type ?? "other"}
        value={(node.op as FilterOp) ?? "eq"}
        onChange={(op) => onChange({ ...node, op, value: undefined })}
      />

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

      <button
        onClick={onRemove}
        className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        aria-label="Remove condition"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
