import { describe, expect, it } from "vitest";

import { ContractIndex } from "./contract.js";
import { validateComputation, type ResolvedBindingValue } from "./compute/validate.js";
import { FIXTURE_CONTRACT } from "./fixtures/contract.js";
import type { ComputationSpec } from "./types.js";

const index = new ContractIndex(FIXTURE_CONTRACT);

function validate(spec: ComputationSpec, bindings: ResolvedBindingValue[] = []) {
  return validateComputation(spec, index, undefined, bindings);
}

function binding(parameter: string | number, values: number[]): ResolvedBindingValue {
  return {
    parameter,
    values,
    provenance: {
      source_name: "orders",
      fields: ["revenue"],
      schema_revision: "rev",
      row_count: values.length,
      input_hash: "hash",
    },
  };
}

describe("computation validation", () => {
  it("assembles positional args from args", () => {
    const validated = validate({ module: "stats", function: "median", args: [[1, 2, 3], 3] });
    expect(validated.argsVector).toEqual([[1, 2, 3], 3]);
    expect(validated.entry.name).toBe("stats.median");
  });

  it("assembles from kwargs by name", () => {
    const validated = validate({
      module: "stats",
      function: "median",
      kwargs: { v: [1, 2, 3], n: 3 },
    });
    expect(validated.argsVector).toEqual([[1, 2, 3], 3]);
  });

  it("assembles from bindings by name and index", () => {
    const validated = validate(
      { module: "stat_tests", function: "pearson_r", kwargs: { n: 3 } },
      [binding("x", [1, 2, 3]), binding(1, [4, 5, 6])],
    );
    expect(validated.argsVector).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      3,
    ]);
  });

  it("unknown capability → unsupported_operation with nearest matches", () => {
    expect(() => validate({ module: "stats", function: "mediann" })).toThrowError(
      expect.objectContaining({
        code: "unsupported_operation",
        details: expect.objectContaining({ nearest_matches: expect.arrayContaining(["stats.median"]) }),
      }),
    );
  });

  it("duplicate assignment via args + kwargs → duplicate_argument_binding", () => {
    expect(() =>
      validate({ module: "stats", function: "median", args: [[1]], kwargs: { v: [2] } }),
    ).toThrowError(expect.objectContaining({ code: "duplicate_argument_binding" }));
  });

  it("duplicate assignment via kwargs + bindings → duplicate_argument_binding", () => {
    expect(() =>
      validate({ module: "stats", function: "median", kwargs: { v: [1], n: 1 } }, [
        binding("v", [2]),
      ]),
    ).toThrowError(expect.objectContaining({ code: "duplicate_argument_binding" }));
  });

  it("simulation without seed → seed_required", () => {
    expect(() =>
      validate({ module: "simulate", function: "monte_carlo", args: [{ runs: 100 }] }),
    ).toThrowError(expect.objectContaining({ code: "seed_required" }));
  });

  it("simulation with seed validates and fills the seed parameter", () => {
    const validated = validate({
      module: "simulate",
      function: "monte_carlo",
      args: [{ runs: 100 }],
      seed: 42,
    });
    expect(validated.seed).toBe(42);
    expect(validated.argsVector).toEqual([{ runs: 100 }, 42]);
  });

  it("non-deterministic capabilities are always denied", () => {
    expect(() => validate({ module: "stats_bootstrap", function: "resample" })).toThrowError(
      expect.objectContaining({ code: "unsupported_operation" }),
    );
  });

  it("policy allowedFunctions cannot widen the surface", () => {
    expect(() =>
      validateComputation(
        { module: "stats_bootstrap", function: "resample" },
        index,
        { allowedFunctions: ["stats_bootstrap.resample"] },
        [],
      ),
    ).toThrowError(expect.objectContaining({ code: "unsupported_operation" }));
  });

  it("policy allowedFunctions narrows the surface", () => {
    expect(() =>
      validateComputation(
        { module: "stats", function: "median", args: [[1], 1] },
        index,
        { allowedFunctions: ["stat_tests.pearson_r"] },
        [],
      ),
    ).toThrowError(expect.objectContaining({ code: "policy_denied_function" }));
  });

  it("wire type mismatch → invalid_intent", () => {
    expect(() =>
      validate({ module: "stats", function: "median", args: ["nope" as never, 3] }),
    ).toThrowError(expect.objectContaining({ code: "invalid_intent" }));
  });

  it("missing required parameter → invalid_intent", () => {
    expect(() => validate({ module: "stats", function: "median", args: [[1, 2]] })).toThrowError(
      expect.objectContaining({ code: "invalid_intent" }),
    );
  });

  it("optional tail parameters may be omitted", () => {
    const validated = validate({ module: "rounding", function: "optional_tail", args: [1.5] });
    expect(validated.argsVector).toEqual([1.5]);
  });

  it("unknown kwargs are rejected", () => {
    expect(() =>
      validate({ module: "stats", function: "median", kwargs: { v: [1], n: 1, extra: 1 } }),
    ).toThrowError(expect.objectContaining({ code: "invalid_intent" }));
  });
});
