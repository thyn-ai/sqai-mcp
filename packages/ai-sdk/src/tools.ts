/** The three SQAI tools for the Vercel AI SDK.
 *
 * listSources — discovery (sources, capability modules, function signatures).
 * queryData   — execute one query or computation intent; never throws.
 * explainQuery — dry-run: resolve/verify a query, or validate a computation
 *                against the capability contract without executing it.
 */

import { tool, type Tool } from "ai";
import {
  ContractIndex,
  SqaiError,
  currentPlatformKey,
  invocationHash,
  isReadOnlyEligible,
  lookupCapability,
  type CapabilityEntry,
  type ComputationSpec,
  type QuerySpec,
  type ResolveResponse,
  type SQAI,
  type SqaiSource,
} from "@thyn-ai/sqai";

import {
  explainQueryInputSchema,
  explainQueryOutputSchema,
  listSourcesInputSchema,
  listSourcesOutputSchema,
  queryDataInputSchema,
  queryDataOutputSchema,
  type ClarificationOutput,
  type ErrorOutput,
  type ExplainQueryOutput,
  type ListSourcesInput,
  type ListSourcesOutput,
  type QueryDataInput,
  type QueryDataOutput,
  type RejectedOutput,
} from "./schemas.js";
import { shapeComputationValue, shapeQueryResult, storeWithinCap } from "./truncate.js";
import type { SQAIToolkit } from "./toolkit.js";

export interface SqaiToolsOptions {
  /** Pin every query to this source (spec.source still wins when provided). */
  source?: string;
  defaultLimit?: number;
  maxExecutionRows?: number;
  maxRowsToModel?: number;
  maxCellsToModel?: number;
  maxElementsToModel?: number;
  maxBytesToModel?: number;
  maxOutputBytes?: number;
}

const DEFAULT_OPTIONS: Required<Omit<SqaiToolsOptions, "source">> = {
  defaultLimit: 100,
  maxExecutionRows: 1000,
  maxRowsToModel: 25,
  maxCellsToModel: 250,
  maxElementsToModel: 500,
  maxBytesToModel: 32_000,
  maxOutputBytes: 10_000_000,
};

// ── Shared helpers ───────────────────────────────────────────────────────────

function toErrorOutput(error: unknown): ErrorOutput {
  if (error instanceof SqaiError) {
    const nearest = error.details["nearest_matches"];
    const nearestMatches =
      Array.isArray(nearest) && nearest.every(item => typeof item === "string")
        ? (nearest as string[])
        : undefined;
    return {
      status: "error",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      request_id: error.requestId,
      ...(nearestMatches ? { nearest_matches: nearestMatches } : {}),
    };
  }
  return {
    status: "error",
    code: "internal_error",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    request_id: null,
  };
}

async function readyError(toolkit: SQAIToolkit): Promise<SqaiError | null> {
  try {
    await toolkit.ensureReady();
    return null;
  } catch (error) {
    return error instanceof SqaiError
      ? error
      : new SqaiError(
          "source_connection_failed",
          `Connecting the configured sources failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
  }
}

/** Candidates pass through loosely typed — upstream owns the exact shape. */
function passthroughCandidates(resolution: ResolveResponse): Array<Record<string, unknown>> {
  return (resolution.candidates ?? []).map(candidate => ({ ...candidate }));
}

function clarificationOutput(resolution: ResolveResponse): ClarificationOutput {
  const candidates = resolution.candidates ?? [];
  const names = candidates
    .slice(0, 5)
    .map(candidate => `${candidate.source}.${candidate.column}`);
  const lead = resolution.explanation?.[0] ?? "The request is ambiguous.";
  const question =
    names.length > 0 ? `${lead} Did you mean ${names.join(" or ")}?` : lead;
  return {
    status: "needs_clarification",
    question,
    candidates: passthroughCandidates(resolution),
    explanation: resolution.explanation ?? [],
  };
}

function rejectedOutput(resolution: ResolveResponse): RejectedOutput {
  return {
    status: "rejected",
    rejection_reason: resolution.rejection_reason ?? "rejected",
    candidates: passthroughCandidates(resolution),
    explanation: resolution.explanation ?? [],
  };
}

function renderSignature(entry: CapabilityEntry): string {
  const params = entry.signature.params as Array<{ name: string; type: string; required?: boolean }>;
  const rendered = params
    .map(param => `${param.name}${param.required === false ? "?" : ""}: ${param.type}`)
    .join(", ");
  return `${entry.name}(${rendered}) -> ${entry.signature.returns}`;
}

function splitCapabilityName(name: string): { module: string; functionName: string } {
  const separator = name.lastIndexOf(".");
  return { module: name.slice(0, separator), functionName: name.slice(separator + 1) };
}

type QueryInputSpec = Extract<QueryDataInput, { kind: "query" }>["spec"];
type ComputationInputSpec = Extract<QueryDataInput, { kind: "computation" }>["spec"];

function toQuerySpec(
  spec: QueryInputSpec,
  options: Required<Omit<SqaiToolsOptions, "source">> & { source?: string },
): QuerySpec {
  const sourceName = spec.source ?? options.source;
  return {
    metric: spec.metric,
    ...(spec.aggregation ? { aggregation: spec.aggregation } : {}),
    ...(spec.group_by ? { group_by: spec.group_by } : {}),
    ...(spec.filter ? { filter: spec.filter } : {}),
    limit: Math.min(spec.limit ?? options.defaultLimit, options.maxExecutionRows),
    ...(spec.order ? { order: spec.order } : {}),
    ...(sourceName ? { source_name: sourceName } : {}),
  };
}

function toComputationSpec(spec: ComputationInputSpec): ComputationSpec {
  return {
    module: spec.module,
    function: spec.function,
    args: spec.args ?? [],
    ...(spec.kwargs ? { kwargs: spec.kwargs } : {}),
    ...(spec.bindings ? { bindings: spec.bindings } : {}),
    ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
  };
}

// ── listSources internals ────────────────────────────────────────────────────

const NUMBER_OPS = [
  "sum",
  "avg",
  "count",
  "min",
  "max",
  "eq",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_null",
  "is_not_null",
];
const FILTER_ONLY_OPS = ["eq", "in", "is_null", "is_not_null"];

function opsForFieldType(type: string): string[] {
  if (type === "number") {
    return [...NUMBER_OPS];
  }
  // string / date / boolean — and unknown types get filter ops only.
  return [...FILTER_ONLY_OPS];
}

function describeSources(sources: SqaiSource[]) {
  return sources.map(source => {
    const typedFields =
      source.typed_fields.length > 0
        ? source.typed_fields
        : source.fields.map(name => ({ name, type: "unknown" }));
    return {
      name: source.name,
      fields: typedFields.map(field => ({
        name: field.name,
        type: field.type,
        ops: opsForFieldType(field.type),
      })),
      row_count: source.row_count,
      schema_revision: source.schema_revision,
    };
  });
}

function searchModules(client: SQAI, query: string) {
  const matches = client.searchCapabilities(query, 100);
  const byModule = new Map<
    string,
    {
      name: string;
      category: string;
      deterministic: boolean;
      function_count: number;
      sample_functions: string[];
    }
  >();
  for (const match of matches) {
    const { module, functionName } = splitCapabilityName(match.entry.name);
    let aggregate = byModule.get(module);
    if (!aggregate) {
      if (byModule.size >= 10) {
        continue;
      }
      aggregate = {
        name: module,
        category: match.entry.category,
        deterministic: true,
        function_count: 0,
        sample_functions: [],
      };
      byModule.set(module, aggregate);
    }
    aggregate.function_count += 1;
    if (aggregate.sample_functions.length < 5) {
      aggregate.sample_functions.push(functionName);
    }
  }
  return [...byModule.values()];
}

function moduleFunctions(client: SQAI, index: () => ContractIndex, moduleName: string) {
  const prefix = `${moduleName}.`;
  const entries = client
    .capabilities()
    .capabilities.filter(
      entry => entry.ai_sdk && isReadOnlyEligible(entry) && entry.name.startsWith(prefix),
    );
  if (entries.length === 0) {
    throw new SqaiError("unsupported_operation", `Unknown capability module '${moduleName}'.`, {
      details: { module: moduleName, nearest_matches: index().nearest(moduleName) },
    });
  }
  return entries.map(entry => ({
    name: entry.name,
    signature: renderSignature(entry),
    params: (entry.signature.params as Array<{ name: string; type: string; required?: boolean }>).map(
      param => ({ name: param.name, type: param.type, required: param.required ?? true }),
    ),
    returns: entry.signature.returns,
    deterministic: entry.deterministic,
    seed_required: entry.seed_required ?? false,
  }));
}

// ── Tool factory ─────────────────────────────────────────────────────────────

/** One SQAI tool: an AI-SDK tool whose execute is always present. */
export type SqaiTool<INPUT, OUTPUT> = Tool<INPUT, OUTPUT> & {
  execute: NonNullable<Tool<INPUT, OUTPUT>["execute"]>;
};

/** Index signature keeps this assignable to the AI SDK's ToolSet, so
 * `tools: sqai.tools()` works with no cast. */
export interface SqaiToolSet extends Record<string, Tool> {
  listSources: SqaiTool<ListSourcesInput, ListSourcesOutput>;
  queryData: SqaiTool<QueryDataInput, QueryDataOutput>;
  explainQuery: SqaiTool<QueryDataInput, ExplainQueryOutput>;
}

export function createSqaiTools(toolkit: SQAIToolkit, options: SqaiToolsOptions = {}): SqaiToolSet {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = toolkit.client;

  let cachedIndex: ContractIndex | null = null;
  const contractIndex = (): ContractIndex => {
    if (!cachedIndex) {
      cachedIndex = new ContractIndex(client.capabilities());
    }
    return cachedIndex;
  };

  const listSources = tool({
    description:
      "Discover what SQAI can touch. No arguments: list connected data sources with exact field " +
      "names, types, and allowed operations — call this before queryData so specs use exact names. " +
      "With capabilitySearch: search the deterministic computation catalog and get matching modules. " +
      "With module: list that module's functions with exact signatures.",
    inputSchema: listSourcesInputSchema,
    outputSchema: listSourcesOutputSchema,
    execute: async (input: ListSourcesInput) => {
      const notReady = await readyError(toolkit);
      if (notReady) {
        return toErrorOutput(notReady);
      }
      try {
        if (input?.capabilitySearch) {
          return { modules: searchModules(client, input.capabilitySearch) };
        }
        if (input?.module) {
          return { functions: moduleFunctions(client, contractIndex, input.module) };
        }
        return { sources: describeSources(client.listSources()) };
      } catch (error) {
        return toErrorOutput(error);
      }
    },
  });

  const queryData = tool({
    description:
      "Execute one deterministic, read-only SQAI request. Use kind 'query' for tabular questions " +
      "(aggregations, grouping, filtering) over connected sources — call listSources first for exact " +
      "field names. Use kind 'computation' for math (statistics, financial, vector/matrix, simulation) " +
      "over arrays: never paste large data into args — use bindings to pull columns from connected " +
      "sources. Simulation modules require a seed. Large results are truncated for context; the full " +
      "result stays retrievable via result_id.",
    inputSchema: queryDataInputSchema,
    outputSchema: queryDataOutputSchema,
    execute: async (input: QueryDataInput) => {
      const notReady = await readyError(toolkit);
      if (notReady) {
        return toErrorOutput(notReady);
      }
      try {
        if (input.kind === "query") {
          return await runQuery(input.spec);
        }
        return await runComputation(input.spec);
      } catch (error) {
        return toErrorOutput(error);
      }
    },
  });

  const explainQuery = tool({
    description:
      "Dry-run a queryData request without executing it. kind 'query': resolve and verify the plan " +
      "(resolved_plan, plan steps, plan_hash, confidence, validated). kind 'computation': check the " +
      "capability exists and get its exact signature, a preview invocation_hash, and whether a seed " +
      "is required. Use this to debug clarifications and rejections before running queryData.",
    inputSchema: explainQueryInputSchema,
    outputSchema: explainQueryOutputSchema,
    execute: async (input: QueryDataInput) => {
      const notReady = await readyError(toolkit);
      if (notReady) {
        return toErrorOutput(notReady);
      }
      try {
        if (input.kind === "query") {
          return await explainQueryPlan(input.spec);
        }
        return explainComputation(input.spec);
      } catch (error) {
        return toErrorOutput(error);
      }
    },
  });

  async function runQuery(spec: QueryInputSpec) {
    const querySpec = toQuerySpec(spec, opts);
    const outcome = await client.ask(querySpec);
    if (outcome.status === "needs_clarification") {
      return clarificationOutput(outcome.resolution);
    }
    if (outcome.status === "rejected") {
      return rejectedOutput(outcome.resolution);
    }
    const { data, resolution } = outcome;
    const shaped = shapeQueryResult(data.result, opts);
    const sourceName = data.resolved_source || resolution.resolved_source || null;
    const resultId = storeWithinCap(data.result, opts.maxOutputBytes, value =>
      client.storeResult(value, sourceName ? [sourceName] : []),
    );
    return {
      status: "ok" as const,
      kind: "query" as const,
      data: shaped.data,
      total_rows: shaped.total_rows,
      returned_rows: shaped.returned_rows,
      truncated: shaped.truncated,
      ...(resultId ? { result_id: resultId } : {}),
      plan_hash: data.plan_hash ?? resolution.plan_hash ?? null,
      schema_revision: data.schema_revision ?? resolution.schema_revision ?? null,
      source_name: sourceName,
      intent_signature: resolution.intent_signature ?? null,
      deterministic_scope: data.deterministic_scope ?? resolution.deterministic_scope ?? null,
      decision_path: data.decision_path ?? resolution.decision_path ?? null,
      validated: data.validated ?? resolution.validated ?? null,
      request_id: data.request_id ?? resolution.request_id ?? null,
      explanation: data.explanation ?? resolution.explanation ?? [],
    };
  }

  async function runComputation(spec: ComputationInputSpec) {
    const result = await client.compute(toComputationSpec(spec));
    const shaped = shapeComputationValue(result.value, opts);
    const sourceIds = result.provenance?.bindings.map(binding => binding.source_name) ?? [];
    const resultId = storeWithinCap(result.value, opts.maxOutputBytes, value =>
      client.storeResult(value, sourceIds),
    );
    return {
      status: "ok" as const,
      kind: "computation" as const,
      value: shaped.value,
      value_type: result.value_type,
      ...(shaped.preview !== undefined ? { preview: shaped.preview } : {}),
      ...(shaped.element_count !== undefined ? { element_count: shaped.element_count } : {}),
      truncated: shaped.truncated,
      ...(resultId ? { result_id: resultId } : {}),
      invocation_hash: result.invocation_hash,
      computation_hash: result.computation_hash,
      contract_hash: result.contract_hash,
      determinism: result.determinism,
      ...(result.provenance ? { provenance: result.provenance } : {}),
      latency_ms: result.latency_ms,
      request_id: result.request_id,
    };
  }

  async function explainQueryPlan(spec: QueryInputSpec) {
    const resolution = await client.resolve(toQuerySpec(spec, opts));
    if (resolution.clarification_required) {
      return clarificationOutput(resolution);
    }
    if (resolution.rejection_reason || !resolution.resolved_plan) {
      return rejectedOutput(resolution);
    }
    const verification = await client.verify(resolution);
    return {
      status: "ok" as const,
      kind: "query" as const,
      resolved_plan: resolution.resolved_plan as unknown as Record<string, unknown>,
      plan: resolution.plan ?? [],
      plan_hash: resolution.plan_hash ?? null,
      confidence: resolution.confidence,
      validated: verification.valid === true,
    };
  }

  /** Validate a computation without executing it: capability existence and
   * signature from the contract, plus a preview invocation_hash computed over
   * UNRESOLVED binding descriptors (input_hash left empty — the definitive
   * hash requires extraction, which explain never performs). */
  function explainComputation(spec: ComputationInputSpec) {
    const index = contractIndex();
    const entry = lookupCapability(index, spec.module, spec.function);
    const bindings = spec.bindings ?? [];
    const descriptors = bindings.flatMap(binding =>
      "parameters" in binding
        ? binding.parameters.map((parameter, position) => ({
            parameter,
            source_name: binding.source,
            fields: [binding.fields[position] ?? ""],
            input_hash: "",
          }))
        : [
            {
              parameter: binding.parameter,
              source_name: binding.source,
              fields: [binding.field],
              input_hash: "",
            },
          ],
    );
    const previewHash = invocationHash({
      module: spec.module,
      function: spec.function,
      args: spec.args ?? [],
      kwargs: spec.kwargs ?? {},
      resolved_bindings: descriptors,
      seed: spec.seed ?? null,
      contract_hash: index.contract.capability_contract_hash,
      execution_scope: `${currentPlatformKey()}:${client.mode}`,
    });
    return {
      status: "ok" as const,
      kind: "computation" as const,
      matched_signature: renderSignature(entry),
      invocation_hash: previewHash,
      seed_required: entry.seed_required ?? false,
    };
  }

  return { listSources, queryData, explainQuery };
}
