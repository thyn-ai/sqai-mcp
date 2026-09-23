/** Model-context shaping: what the model sees is a truncated, well-labeled
 * projection; the full result is stored (subject to maxOutputBytes) and
 * retrievable by result_id. Truncation is always declared, never silent. */

import type { SqaiValue } from "@thyn-ai/sqai";

export type Cell = number | string | boolean | null;

export interface ShapedQueryResult {
  data: { columns: string[]; rows: Cell[][] };
  total_rows: number;
  returned_rows: number;
  truncated: boolean;
}

export interface QueryShapingOptions {
  maxRowsToModel: number;
  maxCellsToModel: number;
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

/** Shape a query-plane result (scalar or array of row records) into a compact
 * columns/rows table. Truncation is rows-first, then whole rows are dropped
 * until the cell budget fits — a partial row is never shown. */
export function shapeQueryResult(result: unknown, options: QueryShapingOptions): ShapedQueryResult {
  if (!Array.isArray(result)) {
    return {
      data: { columns: ["value"], rows: [[toCell(result)]] },
      total_rows: 1,
      returned_rows: 1,
      truncated: false,
    };
  }
  const totalRows = result.length;
  if (totalRows === 0) {
    return { data: { columns: [], rows: [] }, total_rows: 0, returned_rows: 0, truncated: false };
  }

  const first = result[0];
  let columns: string[];
  let toRow: (row: unknown) => Cell[];
  if (first !== null && typeof first === "object" && !Array.isArray(first)) {
    columns = Object.keys(first as Record<string, unknown>);
    toRow = row => columns.map(column => toCell((row as Record<string, unknown>)[column]));
  } else {
    columns = ["value"];
    toRow = row => [toCell(row)];
  }

  // Rows first…
  let keep = Math.min(totalRows, Math.max(0, Math.floor(options.maxRowsToModel)));
  // …then cells: drop whole rows until the cell budget fits.
  const cellsPerRow = Math.max(1, columns.length);
  if (keep * cellsPerRow > options.maxCellsToModel) {
    keep = Math.max(0, Math.floor(options.maxCellsToModel / cellsPerRow));
  }

  return {
    data: { columns, rows: result.slice(0, keep).map(toRow) },
    total_rows: totalRows,
    returned_rows: keep,
    truncated: keep < totalRows,
  };
}

export interface ShapedComputationValue {
  value: SqaiValue;
  preview?: SqaiValue;
  element_count?: number;
  truncated: boolean;
}

export interface ComputationShapingOptions {
  maxElementsToModel: number;
  maxBytesToModel: number;
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf-8");
}

/** Shape a computation-plane value for the model context.
 *
 * Scalars pass through. Arrays/matrices surface as a `preview` of leading
 * elements (element_count = full count), halved until the byte budget fits.
 * Objects pass unless they exceed the byte budget — then the model gets only
 * the truncated flag and (from the caller) a result_id. */
export function shapeComputationValue(
  value: SqaiValue,
  options: ComputationShapingOptions,
): ShapedComputationValue {
  if (value === null || typeof value !== "object") {
    return { value, truncated: false };
  }

  if (Array.isArray(value)) {
    const elementCount = value.length;
    let preview = value.slice(0, Math.min(elementCount, Math.max(0, options.maxElementsToModel)));
    while (preview.length > 0 && byteLength(preview) > options.maxBytesToModel) {
      preview = preview.slice(0, Math.floor(preview.length / 2));
    }
    return {
      value: null,
      preview,
      element_count: elementCount,
      truncated: preview.length < elementCount,
    };
  }

  // Records and tagged scalars ({type: "decimal"|"bigint", value}).
  if (byteLength(value) <= options.maxBytesToModel) {
    return { value, truncated: false };
  }
  return { value: null, truncated: true };
}

/** Hard cap on what gets STORED: if the full value's JSON exceeds
 * maxOutputBytes, nothing is stored and there is no result_id. */
export function storeWithinCap(
  value: unknown,
  maxOutputBytes: number,
  store: (value: unknown) => string,
): string | undefined {
  if (byteLength(value) > maxOutputBytes) {
    return undefined;
  }
  return store(value);
}
