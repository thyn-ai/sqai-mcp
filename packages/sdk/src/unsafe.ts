/** Explicit escape hatch — NOT part of the SQAI contract.
 *
 * The read-only, deterministic, policy, provenance, and compatibility
 * guarantees apply only to the SQAI public methods. The unsafe engine
 * runtime returned here bypasses the capability contract, policy allow-lists,
 * seed enforcement, and the parity matrix, and is never available through
 * @thyn-ai/sqai-ai-sdk. Import from "@thyn-ai/sqai/unsafe" only when you own the
 * consequences.
 */

import { Runtime } from "algenta-sdk";

export interface UnsafeRuntimeOptions {
  mode?: "local" | "api" | "deployment";
  apiKey?: string;
  baseUrl?: string;
}

export type UnsafeRuntime = unknown;

export function getUnsafeRuntime(options: UnsafeRuntimeOptions = {}): UnsafeRuntime {
  return new Runtime({
    mode: options.mode === "deployment" ? "self_hosted" : (options.mode ?? "local"),
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  } as ConstructorParameters<typeof Runtime>[0]);
}
