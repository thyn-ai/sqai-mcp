import { describe, expect, it, vi } from "vitest";

import { shapeComputationValue, shapeQueryResult, storeWithinCap } from "./truncate.js";

function tableRows(rows: number, columns: number): Array<Record<string, number>> {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Object.fromEntries(
      Array.from({ length: columns }, (_, colIndex) => [`c${colIndex}`, rowIndex * 100 + colIndex]),
    ),
  );
}

describe("shapeQueryResult", () => {
  it("shapes scalars as a one-cell 'value' table", () => {
    const shaped = shapeQueryResult(387.4583333333333, { maxRowsToModel: 25, maxCellsToModel: 250 });
    expect(shaped).toEqual({
      data: { columns: ["value"], rows: [[387.4583333333333]] },
      total_rows: 1,
      returned_rows: 1,
      truncated: false,
    });
  });

  it("shapes row records into columns/rows without truncation when within budget", () => {
    const result = [
      { region: "east", revenue: 2130.5, count: 5 },
      { region: "west", revenue: 1519, count: 4 },
    ];
    const shaped = shapeQueryResult(result, { maxRowsToModel: 25, maxCellsToModel: 250 });
    expect(shaped.data.columns).toEqual(["region", "revenue", "count"]);
    expect(shaped.data.rows).toEqual([
      ["east", 2130.5, 5],
      ["west", 1519, 4],
    ]);
    expect(shaped.total_rows).toBe(2);
    expect(shaped.returned_rows).toBe(2);
    expect(shaped.truncated).toBe(false);
  });

  it("truncates rows first", () => {
    const shaped = shapeQueryResult(tableRows(50, 4), { maxRowsToModel: 25, maxCellsToModel: 250 });
    expect(shaped.total_rows).toBe(50);
    expect(shaped.returned_rows).toBe(25); // 25 rows * 4 cols = 100 cells, within budget
    expect(shaped.truncated).toBe(true);
    expect(shaped.data.rows).toHaveLength(25);
  });

  it("then drops whole rows until the cell budget fits", () => {
    const shaped = shapeQueryResult(tableRows(50, 10), { maxRowsToModel: 25, maxCellsToModel: 100 });
    // rows-first: 25; cells: 25*10=250 > 100 -> floor(100/10)=10 rows
    expect(shaped.returned_rows).toBe(10);
    expect(shaped.data.rows).toHaveLength(10);
    expect(shaped.truncated).toBe(true);
  });

  it("keeps exact-boundary rows and never emits a partial row", () => {
    const shaped = shapeQueryResult(tableRows(6, 5), { maxRowsToModel: 10, maxCellsToModel: 25 });
    // 6 rows * 5 cols = 30 > 25 -> floor(25/5) = 5 whole rows = exactly 25 cells
    expect(shaped.returned_rows).toBe(5);
    expect(shaped.data.rows.every(row => row.length === 5)).toBe(true);
    expect(shaped.truncated).toBe(true);
  });

  it("returns zero rows when a single row exceeds the cell budget", () => {
    const shaped = shapeQueryResult(tableRows(3, 50), { maxRowsToModel: 10, maxCellsToModel: 25 });
    expect(shaped.returned_rows).toBe(0);
    expect(shaped.truncated).toBe(true);
    expect(shaped.data.columns).toHaveLength(50);
  });

  it("shapes arrays of scalars as a 'value' column and empty arrays as empty tables", () => {
    const scalars = shapeQueryResult([1, 2, 3], { maxRowsToModel: 2, maxCellsToModel: 250 });
    expect(scalars.data.columns).toEqual(["value"]);
    expect(scalars.data.rows).toEqual([[1], [2]]);
    expect(scalars.truncated).toBe(true);

    const empty = shapeQueryResult([], { maxRowsToModel: 25, maxCellsToModel: 250 });
    expect(empty).toEqual({
      data: { columns: [], rows: [] },
      total_rows: 0,
      returned_rows: 0,
      truncated: false,
    });
  });
});

describe("shapeComputationValue", () => {
  const options = { maxElementsToModel: 500, maxBytesToModel: 32_000 };

  it("passes scalars through untouched", () => {
    expect(shapeComputationValue(2, options)).toEqual({ value: 2, truncated: false });
    expect(shapeComputationValue("x", options)).toEqual({ value: "x", truncated: false });
    expect(shapeComputationValue(null, options)).toEqual({ value: null, truncated: false });
    expect(shapeComputationValue(true, options)).toEqual({ value: true, truncated: false });
  });

  it("previews arrays with full element_count and element cap", () => {
    const value = Array.from({ length: 1000 }, (_, index) => index);
    const shaped = shapeComputationValue(value, options);
    expect(shaped.value).toBeNull();
    expect(shaped.element_count).toBe(1000);
    expect(Array.isArray(shaped.preview)).toBe(true);
    expect((shaped.preview as number[]).length).toBe(500);
    expect((shaped.preview as number[])[0]).toBe(0);
    expect(shaped.truncated).toBe(true);
  });

  it("keeps small arrays complete (still surfaced as preview)", () => {
    const shaped = shapeComputationValue([1, 2, 3], options);
    expect(shaped.preview).toEqual([1, 2, 3]);
    expect(shaped.element_count).toBe(3);
    expect(shaped.truncated).toBe(false);
  });

  it("halves the preview until the byte budget fits", () => {
    const value = Array.from({ length: 400 }, () => "x".repeat(100));
    const shaped = shapeComputationValue(value, { maxElementsToModel: 500, maxBytesToModel: 2_000 });
    const preview = shaped.preview as string[];
    expect(Buffer.byteLength(JSON.stringify(preview), "utf-8")).toBeLessThanOrEqual(2_000);
    expect(preview.length).toBeLessThan(400);
    expect(preview.length).toBeGreaterThan(0);
    expect(shaped.element_count).toBe(400);
    expect(shaped.truncated).toBe(true);
  });

  it("passes small objects and drops oversized ones to result_id-only", () => {
    const small = { mean: 1, p95: 2 };
    expect(shapeComputationValue(small, options)).toEqual({ value: small, truncated: false });

    const big = { blob: "x".repeat(50_000) };
    const shaped = shapeComputationValue(big, options);
    expect(shaped).toEqual({ value: null, truncated: true });
  });

  it("passes tagged high-precision scalars", () => {
    const tagged = { type: "bigint" as const, value: "9007199254740993" };
    expect(shapeComputationValue(tagged, options)).toEqual({ value: tagged, truncated: false });
  });
});

describe("storeWithinCap", () => {
  it("stores within the cap and returns the id", () => {
    const store = vi.fn(() => "result_1");
    expect(storeWithinCap([1, 2, 3], 1_000, store)).toBe("result_1");
    expect(store).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("skips storage entirely above maxOutputBytes — no result_id", () => {
    const store = vi.fn(() => "result_2");
    const oversized = "x".repeat(2_000);
    expect(storeWithinCap(oversized, 1_000, store)).toBeUndefined();
    expect(store).not.toHaveBeenCalled();
  });
});
