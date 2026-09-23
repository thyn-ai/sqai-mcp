/** Application policy: pre-execution validation the model can never override.
 *
 * SQAI validates; the managed runtime calculates. Package capability = the contract's
 * all-readonly surface; application policy = the subset enabled here; a model
 * request = one operation inside that subset.
 */

import { SqaiError } from "./errors.js";
import { isReadOnlyEligible, type CapabilityEntry } from "./contract.js";

export interface SqaiPolicy {
  allowedSources?: string[];
  /** Per-source field allowlist. */
  allowedFields?: Record<string, string[]>;
  /** "all-readonly" (default) or explicit "module.function" ids. */
  allowedFunctions?: "all-readonly" | string[];
}

export function checkSourceAllowed(policy: SqaiPolicy | undefined, sourceName: string): void {
  if (policy?.allowedSources && !policy.allowedSources.includes(sourceName)) {
    throw new SqaiError("policy_denied_source", `Source '${sourceName}' is not allowed by policy.`, {
      details: { source: sourceName, allowed: policy.allowedSources },
    });
  }
}

export function checkFieldAllowed(
  policy: SqaiPolicy | undefined,
  sourceName: string,
  field: string,
): void {
  const allowed = policy?.allowedFields?.[sourceName];
  if (allowed && !allowed.includes(field)) {
    throw new SqaiError(
      "policy_denied_field",
      `Field '${field}' on source '${sourceName}' is not allowed by policy.`,
      { details: { source: sourceName, field, allowed } },
    );
  }
}

export function checkFunctionAllowed(
  policy: SqaiPolicy | undefined,
  entry: CapabilityEntry,
): void {
  const allowedFunctions = policy?.allowedFunctions ?? "all-readonly";
  if (allowedFunctions === "all-readonly") {
    if (!isReadOnlyEligible(entry)) {
      throw new SqaiError(
        "unsupported_operation",
        `Capability '${entry.name}' is ${entry.category} and not part of the read-only deterministic surface.`,
        { details: { name: entry.name, category: entry.category } },
      );
    }
    return;
  }
  if (!allowedFunctions.includes(entry.name)) {
    throw new SqaiError(
      "policy_denied_function",
      `Capability '${entry.name}' is not allowed by policy.`,
      { details: { name: entry.name, allowed: allowedFunctions } },
    );
  }
  if (!isReadOnlyEligible(entry)) {
    throw new SqaiError(
      "unsupported_operation",
      `Capability '${entry.name}' is not read-only deterministic; policy cannot widen the package surface.`,
      { details: { name: entry.name, category: entry.category } },
    );
  }
}
