/** Computation dispatch: delegate a validated computation to the runtime.
 *
 * deployment / api mode → POST {baseUrl}/v1/libraries/execute.
 * SQAI performs no calculation of its own in either path.
 */

import { SqaiError, fromEngineError } from "../errors.js";
import type { CapabilityEntry } from "../contract.js";
import type { SqaiValue } from "../types.js";

export interface LocalComputeRuntime {
  execute(
    module: string,
    functionName: string,
    args?: SqaiValue,
    requestId?: string,
    timeoutSeconds?: number,
  ): Promise<{
    result: unknown;
    latency_ms: number;
    engine_used: string;
    request_id?: string | null;
  }>;
}

export type DispatchTarget =
  | { kind: "local"; runtime: LocalComputeRuntime }
  | { kind: "http"; baseUrl: string; apiKey?: string; fetchImpl?: typeof fetch };

export interface DispatchOutcome {
  value: SqaiValue;
  latency_ms: number;
  engine_used: string;
  request_id: string;
}

export async function dispatchComputation(
  target: DispatchTarget,
  entry: CapabilityEntry,
  argsVector: SqaiValue[],
  seed: number | string | null,
  requestId: string,
  timeoutSeconds?: number,
): Promise<DispatchOutcome> {
  const { module, functionName, args } = wireInvocation(entry, argsVector, seed);
  if (target.kind === "local") {
    try {
      // Containment is enforced by the daemon (a per-request timeout can
      // lower the daemon's ceiling, never raise it).
      const response = await target.runtime.execute(
        module,
        functionName,
        args,
        requestId,
        timeoutSeconds,
      );
      return {
        value: response.result as SqaiValue,
        latency_ms: response.latency_ms,
        engine_used: response.engine_used,
        request_id: response.request_id ?? requestId,
      };
    } catch (error) {
      throw fromEngineError(error);
    }
  }
  return dispatchHttp(target, module, functionName, args, requestId);
}

/** simulate.<engine> capabilities dispatch as execute(engine, "run", config)
 * with the seed merged into the config — the upstream simulate() sugar. */
function wireInvocation(
  entry: CapabilityEntry,
  argsVector: SqaiValue[],
  seed: number | string | null,
): { module: string; functionName: string; args: SqaiValue } {
  const [module = "", functionName = ""] = splitName(entry.name);
  if (entry.category === "simulation") {
    const config = (argsVector[0] ?? {}) as Record<string, SqaiValue>;
    return {
      module: functionName,
      functionName: "run",
      args: { ...config, ...(seed === null ? {} : { seed }) } as SqaiValue,
    };
  }
  return { module, functionName, args: argsVector };
}

function splitName(name: string): [string, string] {
  const separator = name.lastIndexOf(".");
  return [name.slice(0, separator), name.slice(separator + 1)];
}

async function dispatchHttp(
  target: { baseUrl: string; apiKey?: string; fetchImpl?: typeof fetch },
  module: string,
  functionName: string,
  args: SqaiValue,
  requestId: string,
): Promise<DispatchOutcome> {
  const fetchImpl = target.fetchImpl ?? fetch;
  const url = `${target.baseUrl.replace(/\/$/, "")}/v1/libraries/execute`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
      },
      body: JSON.stringify({ module, function: functionName, args, request_id: requestId }),
    });
  } catch (error) {
    throw new SqaiError(
      "compute_runtime_unavailable",
      `The SQAI deployment endpoint is unreachable: ${(error as Error).message}. ` +
        "Check SQAI_DEPLOYMENT_URL / SQAI_API_KEY.",
      { retryable: true },
    );
  }
  if (!response.ok) {
    const body = await safeJson(response);
    const code =
      typeof body?.error === "object" && body.error !== null && "code" in body.error
        ? String((body.error as { code: unknown }).code)
        : response.status === 429
          ? "quota_exhausted"
          : "compute_runtime_unavailable";
    throw new SqaiError(code, `Hosted compute request failed with status ${response.status}.`, {
      source: "engine",
      retryable: response.status === 429 || response.status >= 500,
      details: { status: response.status },
    });
  }
  const payload = (await response.json()) as {
    result: SqaiValue;
    latency_ms?: number;
    engine_used?: string;
    request_id?: string | null;
  };
  return {
    value: payload.result,
    latency_ms: payload.latency_ms ?? 0,
    engine_used: payload.engine_used ?? "cloud",
    request_id: payload.request_id ?? requestId,
  };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
