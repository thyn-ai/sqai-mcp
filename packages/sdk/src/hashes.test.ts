import { describe, expect, it } from "vitest";

import { computationHash, invocationHash, type InvocationIdentity } from "./hashes.js";

const identity: InvocationIdentity = {
  module: "stats",
  function: "median",
  args: [[1, 2, 3], 3],
  kwargs: {},
  resolved_bindings: [],
  seed: null,
  contract_hash: "sha256:test",
  execution_scope: "darwin-arm64:local",
};

describe("two-hash determinism contract", () => {
  it("invocation_hash is available before execution and stable", () => {
    const first = invocationHash(identity);
    const second = invocationHash({ ...identity });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computation_hash covers invocation + canonical result", () => {
    const invocation = invocationHash(identity);
    const first = computationHash(invocation, 2);
    expect(first).toBe(computationHash(invocation, 2));
    expect(first).not.toBe(computationHash(invocation, 3));
    expect(first).not.toBe(invocation);
  });

  it("hashes are domain-separated — same payload, different domains, different hashes", () => {
    const invocation = invocationHash(identity);
    // A computation hash of an empty result must never collide with another
    // domain's rendering of the same bytes.
    expect(computationHash(invocation, null)).not.toBe(invocation);
  });

  it("any identity field change moves invocation_hash", () => {
    const base = invocationHash(identity);
    expect(invocationHash({ ...identity, seed: 42 })).not.toBe(base);
    expect(invocationHash({ ...identity, function: "percentile" })).not.toBe(base);
    expect(invocationHash({ ...identity, execution_scope: "linux-x64:local" })).not.toBe(base);
  });
});
