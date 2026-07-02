import { Plus, X, ChevronDown } from "lucide-react";
import { FilterCondition } from "./FilterCondition";
import type { FieldInfo, Filter, LogicalOp } from "./types";
import { emptyGroup, isCondition, isGroup, newCondition } from "./types";

interface Props {
  fields: FieldInfo[];
  node: Filter;
  onChange: (next: Filter) => void;
  onRemove?: () => void; // undefined at root
  depth?: number;
}

export function FilterGroup({
  fields,
  node,
  onChange,
  onRemove,
  depth = 0,
}: Props) {
  const conditions = node.conditions ?? [];

  const setOp = (op: LogicalOp) => onChange({ ...node, op, conditions });

  const setChild = (idx: number, next: Filter) => {
    const nextConditions = conditions.slice();
    nextConditions[idx] = next;
    onChange({ ...node, conditions: nextConditions });
  };

  const removeChild = (idx: number) => {
    const nextConditions = conditions.slice();
    nextConditions.splice(idx, 1);
    onChange({ ...node, conditions: nextConditions });
  };

  const addCondition = () => {
    const firstField = fields[0];
    if (!firstField) return;
    onChange({
      ...node,
      conditions: [...conditions, newCondition(firstField.name, "eq")],
    });
  };

  const addGroup = () => {
    onChange({
      ...node,
      conditions: [...conditions, emptyGroup(node.op === "and" ? "or" : "and")],
    });
  };

  const bgTint =
    depth === 0 ? "bg-white" : depth % 2 ? "bg-slate-50" : "bg-white";

  return (
    <div
      className={`relative rounded-lg border border-slate-200 ${bgTint} p-2`}
    >
      <div className="mb-2 flex items-center gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Match
        </label>
        <div className="relative">
          <select
            value={node.op}
            onChange={(e) => setOp(e.target.value as LogicalOp)}
            className="appearance-none rounded-md border border-slate-200 bg-white pl-2 pr-6 py-0.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus:border-emerald-500"
          >
            <option value="and">ALL of</option>
            <option value="or">ANY of</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
        </div>

        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Remove group"
            title="Remove group"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {conditions.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-center text-[11px] text-slate-400">
            No conditions yet
          </div>
        )}

        {conditions.map((c, i) => {
          if (isGroup(c)) {
            return (
              <FilterGroup
                key={i}
                fields={fields}
                node={c}
                onChange={(next) => setChild(i, next)}
                onRemove={() => removeChild(i)}
                depth={depth + 1}
              />
            );
          }
          if (isCondition(c)) {
            return (
              <FilterCondition
                key={i}
                fields={fields}
                node={c}
                onChange={(next) => setChild(i, next)}
                onRemove={() => removeChild(i)}
              />
            );
          }
          return null;
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button
          onClick={addCondition}
          disabled={fields.length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Condition
        </button>
        <button
          onClick={addGroup}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3 w-3" />
          Group
        </button>
      </div>
    </div>
  );
}
