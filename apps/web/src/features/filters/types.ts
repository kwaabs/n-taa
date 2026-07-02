// Recursive filter AST. Mirrors the Go backend shape.
export type FilterOp =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "starts_with"
  | "in"
  | "between"
  | "is_null"
  | "is_not_null"
  | "is_true"
  | "is_false";

export type LogicalOp = "and" | "or";

/**
 * A filter is either a Group (op = and/or, conditions = children)
 * or a Condition (column + op + value).
 * The shape follows the backend's `features.Filter` struct.
 */
export interface Filter {
  op: LogicalOp | FilterOp;
  conditions?: Filter[]; // Group only
  column?: string; // Condition only
  value?: unknown; // Condition only
}

export type FieldType = "text" | "number" | "boolean" | "date" | "other";

export interface FieldInfo {
  name: string;
  type: FieldType;
  nullable: boolean;
  distinct_values?: string[];
}

/**
 * Small helpers so callers don't reason about tree shape by hand.
 */
export function isGroup(f: Filter): boolean {
  return (f.op === "and" || f.op === "or") && Array.isArray(f.conditions);
}

export function isCondition(f: Filter): boolean {
  return typeof f.column === "string" && f.column.length > 0;
}

export function emptyGroup(op: LogicalOp = "and"): Filter {
  return { op, conditions: [] };
}

export function newCondition(
  column: string,
  op: FilterOp,
  value?: unknown,
): Filter {
  return { column, op, value };
}

/**
 * Returns true if the filter tree has any effective conditions.
 * (Ignores empty groups, ignores null trees.)
 */
export function hasAnyCondition(f: Filter | null | undefined): boolean {
  if (!f) return false;
  if (isCondition(f)) return true;
  if (!f.conditions) return false;
  return f.conditions.some(hasAnyCondition);
}
