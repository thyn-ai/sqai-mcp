/** Computation-plane validation: dynamic, against the embedded capability
 * contract. The zod wire schema (in @thyn-ai/sqai-ai-sdk) only transports values;
 * everything here authorizes them. SQAI computes nothing; a validated
 * computation is delegated to the managed runtime verbatim.
 *
 * Argument assembly: every signature parameter is supplied through EXACTLY one
 * of args (positional), kwargs (by name), or bindings (by name or index).
 * Duplicate assignment is `duplicate_argument_binding`; SQAI never silently
 * overwrites an argument.
 */

import { SqaiError } from "../errors.js";
import { checkFunctionAllowed, type SqaiPolicy } from "../policy.js";
import type { CapabilityEntry, ContractIndex } from "../contract.js";
import type { SqaiValue, BindingProvenance, ComputationSpec } from "../types.js";

export interface ResolvedBindingValue {
  parameter: string | number;
  values: SqaiValue;
  provenance: BindingProvenance;
}

export interface ValidatedComputation {
  entry: CapabilityEntry;
  /** Final positional argument vector, ordered by the signature params. */
  argsVector: SqaiValue[];
  seed: number | string | null;
  bindings: ResolvedBindingValue[];
}

interface SignatureParamLike {
  name: string;
  type: string;
  required?: boolean;
}

export function lookupCapability(
  index: ContractIndex,
  module: string,
  functionName: string,
): CapabilityEntry {
  const name = `${module}.${functionName}`;
  const entry = index.get(name);
  if (!entry) {
    throw new SqaiError("unsupported_operation", `Unknown capability '${name}'.`, {
      details: { name, nearest_matches: index.nearest(name) },
    });
  }
  return entry;
}

export function validateComputation(
  spec: ComputationSpec,
  index: ContractIndex,
  policy: SqaiPolicy | undefined,
  resolvedBindings: ResolvedBindingValue[],
): ValidatedComputation {
  const entry = lookupCapability(index, spec.module, spec.function);
  checkFunctionAllowed(policy, entry);

  const seed = spec.seed ?? null;
  if (entry.seed_required && seed === null) {
    throw new SqaiError(
      "seed_required",
      `'${entry.name}' is a simulation capability: a seed is required so results are replayable.`,
      { details: { name: entry.name } },
    );
  }

  const params = entry.signature.params as SignatureParamLike[];
  const args = spec.args ?? [];
  const kwargs = spec.kwargs ?? {};

  if (args.length > params.length) {
    throw new SqaiError(
      "invalid_intent",
      `'${entry.name}' takes at most ${params.length} arguments; got ${args.length} positional.`,
      { details: { name: entry.name, params: params.map(param => param.name) } },
    );
  }
  const paramNames = new Set(params.map(param => param.name));
  for (const key of Object.keys(kwargs)) {
    if (!paramNames.has(key)) {
      throw new SqaiError("invalid_intent", `'${entry.name}' has no parameter '${key}'.`, {
        details: { name: entry.name, params: params.map(param => param.name) },
      });
    }
  }

  const assigned = new Map<string, { origin: string; value: SqaiValue }>();
  args.forEach((value, position) => {
    const param = params[position];
    if (param) {
      assigned.set(param.name, { origin: "args", value });
    }
  });
  for (const [key, value] of Object.entries(kwargs)) {
    assertUnassigned(assigned, entry, key, "kwargs");
    assigned.set(key, { origin: "kwargs", value });
  }
  for (const binding of resolvedBindings) {
    const param = resolveParam(params, entry, binding.parameter);
    assertUnassigned(assigned, entry, param.name, "bindings");
    assigned.set(param.name, { origin: "bindings", value: binding.values });
  }

  const argsVector: SqaiValue[] = [];
  for (const param of params) {
    const assignment = assigned.get(param.name);
    if (!assignment) {
      if (param.required === false) {
        break; // optional tail parameters may be omitted (positional dispatch)
      }
      if (param.name === "seed" && entry.seed_required) {
        argsVector.push(seed as SqaiValue);
        continue;
      }
      throw new SqaiError(
        "invalid_intent",
        `'${entry.name}' is missing required parameter '${param.name}'.`,
        { details: { name: entry.name, parameter: param.name } },
      );
    }
    checkWireType(entry, param, assignment.value);
    argsVector.push(assignment.value);
  }

  return { entry, argsVector, seed, bindings: resolvedBindings };
}

function assertUnassigned(
  assigned: Map<string, { origin: string; value: SqaiValue }>,
  entry: CapabilityEntry,
  name: string,
  origin: string,
): void {
  const existing = assigned.get(name);
  if (existing) {
    throw new SqaiError(
      "duplicate_argument_binding",
      `Parameter '${name}' of '${entry.name}' was supplied through both ${existing.origin} and ${origin}.`,
      { details: { name: entry.name, parameter: name } },
    );
  }
}

function resolveParam(
  params: SignatureParamLike[],
  entry: CapabilityEntry,
  parameter: string | number,
): SignatureParamLike {
  const param =
    typeof parameter === "number" ? params[parameter] : params.find(item => item.name === parameter);
  if (!param) {
    throw new SqaiError(
      "invalid_intent",
      `Binding references unknown parameter '${parameter}' of '${entry.name}'.`,
      { details: { name: entry.name, parameter } },
    );
  }
  return param;
}

function checkWireType(entry: CapabilityEntry, param: SignatureParamLike, value: SqaiValue): void {
  if (!matchesWireType(param.type, value)) {
    throw new SqaiError(
      "invalid_intent",
      `Parameter '${param.name}' of '${entry.name}' expects ${param.type}.`,
      { details: { name: entry.name, parameter: param.name, expected: param.type } },
    );
  }
}

function matchesWireType(type: string, value: SqaiValue): boolean {
  switch (type) {
    case "float64":
      return typeof value === "number" && Number.isFinite(value);
    case "int":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "bool":
      return typeof value === "boolean";
    case "float64[]":
      return Array.isArray(value) && value.every(item => typeof item === "number" && Number.isFinite(item));
    case "int[]":
      return Array.isArray(value) && value.every(item => typeof item === "number" && Number.isInteger(item));
    case "string[]":
      return Array.isArray(value) && value.every(item => typeof item === "string");
    case "float64[][]":
      return (
        Array.isArray(value) &&
        value.every(
          row =>
            Array.isArray(row) &&
            row.every(item => typeof item === "number" && Number.isFinite(item)),
        )
      );
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      // Unknown/raw inventory types: transport as-is; the runtime validates at dispatch.
      return true;
  }
}
