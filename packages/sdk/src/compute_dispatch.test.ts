import { describe, expect, it, vi } from "vitest";

import { dispatchComputation } from "./compute/dispatch.js";
import { ContractIndex } from "./contract.js";
import { FIXTURE_CONTRACT } from "./fixtures/contract.js";
import type { MojoRuntime } from "algenta-sdk";

const index = new ContractIndex(FIXTURE_CONTRACT);

function mockRuntime(result: unknown): MojoRuntime {
  return {
    execute: vi.fn(async (module: string, functionName: string, args?: unknown) => ({
      module,
      function: functionName,
      result,
      latency_ms: 1.5,
      engine_used: "mojo",
      request_id: "req_1",
    })),
  } as unknown as MojoRuntime;
}

describe("computation dispatch", () => {
  it("library capabilities dispatch positionally", async () => {
    const runtime = mockRuntime(2);
    const entry = index.get("stats.median");
    if (!entry) throw new Error("fixture missing");
    const outcome = await dispatchComputation(
      { kind: "local", runtime },
      entry,
      [[1, 2, 3], 3],
      null,
      "req_1",
    );
    expect(outcome.value).toBe(2);
    expect(outcome.engine_used).toBe("mojo");
    expect(runtime.execute).toHaveBeenCalledWith("stats", "median", [[1, 2, 3], 3], "req_1", undefined);
  });

  it("simulation capabilities dispatch as execute(engine, 'run', config+seed)", async () => {
    const runtime = mockRuntime({ mean: 1 });
    const entry = index.get("simulate.monte_carlo");
    if (!entry) throw new Error("fixture missing");
    await dispatchComputation({ kind: "local", runtime }, entry, [{ runs: 100 }, 42], 42, "req_2");
    expect(runtime.execute).toHaveBeenCalledWith(
      "monte_carlo",
      "run",
      { runs: 100, seed: 42 },
      "req_2",
      undefined,
    );
  });

  it("http dispatch posts to /v1/libraries/execute and maps errors", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ result: 7, latency_ms: 3, engine_used: "cloud" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const entry = index.get("stats.median");
    if (!entry) throw new Error("fixture missing");
    const outcome = await dispatchComputation(
      { kind: "http", baseUrl: "https://engine.example.com/", apiKey: "k", fetchImpl },
      entry,
      [[1], 1],
      null,
      "req_3",
    );
    expect(outcome.value).toBe(7);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://engine.example.com/v1/libraries/execute");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(String(init.body))).toEqual({
      module: "stats",
      function: "median",
      args: [[1], 1],
      request_id: "req_3",
    });
  });

  it("http failure maps to structured retryable errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 503 }));
    const entry = index.get("stats.median");
    if (!entry) throw new Error("fixture missing");
    await expect(
      dispatchComputation(
        { kind: "http", baseUrl: "https://engine.example.com", fetchImpl },
        entry,
        [[1], 1],
        null,
        "req_4",
      ),
    ).rejects.toMatchObject({ code: "compute_runtime_unavailable", retryable: true });
  });
});
