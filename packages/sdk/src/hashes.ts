/** Two-hash determinism contract.
 *
 * invocation_hash — known BEFORE execution: the normalized operation identity
 * (module, function, args, kwargs, resolved bindings, seed, contract hash,
 * input hashes, declared execution scope). `explainQuery` returns this one.
 *
 * computation_hash — known only AFTER execution: invocation_hash plus the
 * canonically serialized result.
 *
 * Both are domain-separated and rendered with the cross-language canonical
 * JSON locked by the upstream conformance suite, so TypeScript and Python
 * produce identical hashes for identical work.
 */

import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.js";

import type { SqaiValue } from "./types.js";

const INVOCATION_DOMAIN = "sqai:invocation:v1\0";
const COMPUTATION_DOMAIN = "sqai:computation:v1\0";

export interface InvocationIdentity {
  module: string;
  function: string;
  args: SqaiValue[];
  kwargs: Record<string, SqaiValue>;
  resolved_bindings: Array<{
    parameter: string | number;
    source_name: string;
    fields: string[];
    input_hash: string;
  }>;
  seed: number | string | null;
  contract_hash: string;
  execution_scope: string;
}

export function invocationHash(identity: InvocationIdentity): string {
  return sha256(INVOCATION_DOMAIN + canonicalJson(identity));
}

export function computationHash(invocation: string, result: unknown): string {
  return sha256(COMPUTATION_DOMAIN + invocation + canonicalJson(result));
}

/** Input provenance hash: sha256 over the canonical JSON of the admitted
 * argument vector. Computed by SQAI itself (mirrored byte-for-byte by the
 * Python SDK's sqai.input_hash) — the post-1.0.6 substrate no longer ships a
 * cross-language canonical renderer, so SQAI owns this identity. */
export function inputHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}
