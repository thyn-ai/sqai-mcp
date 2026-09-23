/** Zod v4 schemas for the SQAI AI-SDK tools.
 *
 * These schemas transport; the @thyn-ai/sqai capability contract and policy layer
 * authorize. No policy key is reachable from any input schema: application
 * policy is configured in code, never by the model.
 */

import { z } from "zod";
import type { SqaiValue } from "@thyn-ai/sqai";

// ── Query plane ──────────────────────────────────────────────────────────────

export const filterConditionSchema = z.object({
  column: z.string().optional().describe("Exact column name to filter on."),
  op: z.enum(["eq", "in", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Values for the 'in' operator."),
});

export const filterSpecSchema = z.object({
  time_filter: z.string().optional().describe("Named time window, e.g. 'last_30_days'."),
  conditions: z.array(filterConditionSchema).optional(),
});

export const querySpecSchema = z.object({
  metric: z
    .string()
    .describe("The measure to compute, e.g. 'revenue'. Use exact field names from listSources."),
  aggregation: z.enum(["sum", "avg", "count", "min", "max"]).optional(),
  group_by: z.string().optional().describe("Column to group results by."),
  filter: filterSpecSchema.optional(),
  limit: z.number().int().positive().optional().describe("Maximum rows to return."),
  order: z.enum(["asc", "desc"]).optional(),
  source: z
    .string()
    .optional()
    .describe("Source name to query (maps to source_name). Omit to let the planner pick."),
});

// ── Wire values (computation plane transport) ────────────────────────────────

/** Tagged high-precision scalars ride the wire as {type, value}. */
const taggedScalarSchema = z.object({
  type: z.enum(["decimal", "bigint"]),
  value: z.string(),
});

export const sqaiValueSchema: z.ZodType<SqaiValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(sqaiValueSchema),
    taggedScalarSchema,
    z.record(z.string(), sqaiValueSchema),
  ]),
);

// ── Computation plane ────────────────────────────────────────────────────────

const singleBindingSchema = z.object({
  parameter: z
    .union([z.string(), z.number()])
    .describe("Target parameter, by name or positional index."),
  source: z.string().describe("Connected source name to pull the column from."),
  field: z.string().describe("Column to extract."),
  filter: filterSpecSchema.optional(),
});

const alignedBindingSchema = z.object({
  parameters: z
    .array(z.union([z.string(), z.number()]))
    .describe("Target parameters, one per field, row-aligned."),
  source: z.string(),
  fields: z.array(z.string()).describe("Columns to extract, one per parameter."),
  filter: filterSpecSchema.optional(),
  alignment: z.literal("rowwise"),
  nullPolicy: z.enum(["pairwise", "preserve"]).optional(),
});

export const computationBindingSchema = z.union([singleBindingSchema, alignedBindingSchema]);

export const computationSpecSchema = z.object({
  module: z.string().describe("Capability module, e.g. 'stats'. Discover via listSources."),
  function: z.string().describe("Function inside the module, e.g. 'median'."),
  args: z.array(sqaiValueSchema).default([]).describe("Positional arguments."),
  kwargs: z.record(z.string(), sqaiValueSchema).optional().describe("Named arguments."),
  bindings: z
    .array(computationBindingSchema)
    .optional()
    .describe("Pull columns from connected sources instead of pasting data inline."),
  seed: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Required for simulation modules; makes runs replayable"),
});

// ── Tool input ───────────────────────────────────────────────────────────────

export const queryDataInputSchema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal("1"),
    kind: z.literal("query"),
    spec: querySpecSchema,
  }),
  z.object({
    version: z.literal("1"),
    kind: z.literal("computation"),
    spec: computationSpecSchema,
  }),
]);

export const explainQueryInputSchema = queryDataInputSchema;

export const listSourcesInputSchema = z.object({
  capabilitySearch: z
    .string()
    .optional()
    .describe("Search the computation capability catalog; returns matching modules."),
  module: z
    .string()
    .optional()
    .describe("List a module's functions with exact signatures."),
});

// ── Tool output ──────────────────────────────────────────────────────────────

const cellSchema = z.union([z.number(), z.string(), z.boolean(), z.null()]);

/** Resolver candidates pass through loosely typed — upstream owns the shape. */
export const candidateSchema = z.looseObject({
  source: z.string().optional(),
  column: z.string().optional(),
  role: z.string().optional(),
  confidence: z.number().optional(),
});

export const errorOutputSchema = z.object({
  status: z.literal("error"),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  request_id: z.string().nullable(),
  nearest_matches: z.array(z.string()).optional(),
});

export const clarificationOutputSchema = z.object({
  status: z.literal("needs_clarification"),
  question: z.string(),
  candidates: z.array(candidateSchema),
  explanation: z.array(z.string()),
});

export const rejectedOutputSchema = z.object({
  status: z.literal("rejected"),
  rejection_reason: z.string(),
  candidates: z.array(candidateSchema),
  explanation: z.array(z.string()),
});

export const queryOkOutputSchema = z.object({
  status: z.literal("ok"),
  kind: z.literal("query"),
  data: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(cellSchema)),
  }),
  total_rows: z.number(),
  returned_rows: z.number(),
  truncated: z.boolean(),
  result_id: z.string().optional(),
  plan_hash: z.string().nullable(),
  schema_revision: z.string().nullable(),
  source_name: z.string().nullable(),
  intent_signature: z.string().nullable(),
  deterministic_scope: z.string().nullable(),
  decision_path: z.string().nullable(),
  validated: z.boolean().nullable(),
  request_id: z.string().nullable(),
  explanation: z.array(z.string()),
});

export const determinismEnvelopeSchema = z.object({
  runtime_bundle_version: z.string(),
  runtime_bundle_sha256: z.string(),
  platform: z.string(),
  architecture: z.string(),
  kernel_build: z.string(),
  precision_mode: z.string(),
  thread_count: z.number(),
  seed: z.union([z.number(), z.string()]).optional(),
  input_hash: z.string(),
});

export const bindingProvenanceSchema = z.object({
  source_name: z.string(),
  fields: z.array(z.string()),
  schema_revision: z.string().nullable(),
  row_count: z.number(),
  input_hash: z.string(),
});

export const computationOkOutputSchema = z.object({
  status: z.literal("ok"),
  kind: z.literal("computation"),
  value: sqaiValueSchema,
  value_type: z.string(),
  preview: sqaiValueSchema.optional(),
  element_count: z.number().optional(),
  truncated: z.boolean(),
  result_id: z.string().optional(),
  invocation_hash: z.string(),
  computation_hash: z.string(),
  contract_hash: z.string(),
  determinism: determinismEnvelopeSchema,
  provenance: z.object({ bindings: z.array(bindingProvenanceSchema) }).optional(),
  latency_ms: z.number(),
  request_id: z.string(),
});

export const queryDataOutputSchema = z.union([
  queryOkOutputSchema,
  computationOkOutputSchema,
  clarificationOutputSchema,
  rejectedOutputSchema,
  errorOutputSchema,
]);

export const sourceListOutputSchema = z.object({
  sources: z.array(
    z.object({
      name: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          ops: z.array(z.string()),
        }),
      ),
      row_count: z.number().nullable(),
      schema_revision: z.string().nullable(),
    }),
  ),
});

export const moduleListOutputSchema = z.object({
  modules: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      deterministic: z.boolean(),
      function_count: z.number(),
      sample_functions: z.array(z.string()),
    }),
  ),
});

export const functionListOutputSchema = z.object({
  functions: z.array(
    z.object({
      name: z.string(),
      signature: z.string(),
      params: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean(),
        }),
      ),
      returns: z.string(),
      deterministic: z.boolean(),
      seed_required: z.boolean(),
    }),
  ),
});

export const listSourcesOutputSchema = z.union([
  sourceListOutputSchema,
  moduleListOutputSchema,
  functionListOutputSchema,
  errorOutputSchema,
]);

export const explainQueryOkQueryOutputSchema = z.object({
  status: z.literal("ok"),
  kind: z.literal("query"),
  resolved_plan: z.record(z.string(), z.unknown()),
  plan: z.array(z.string()),
  plan_hash: z.string().nullable(),
  confidence: z.number(),
  validated: z.boolean(),
});

export const explainQueryOkComputationOutputSchema = z.object({
  status: z.literal("ok"),
  kind: z.literal("computation"),
  matched_signature: z.string(),
  invocation_hash: z.string(),
  seed_required: z.boolean(),
});

export const explainQueryOutputSchema = z.union([
  explainQueryOkQueryOutputSchema,
  explainQueryOkComputationOutputSchema,
  clarificationOutputSchema,
  rejectedOutputSchema,
  errorOutputSchema,
]);

// ── Inferred types ───────────────────────────────────────────────────────────

export type QueryDataInput = z.infer<typeof queryDataInputSchema>;
export type QueryDataOutput = z.infer<typeof queryDataOutputSchema>;
export type ListSourcesInput = z.infer<typeof listSourcesInputSchema>;
export type ListSourcesOutput = z.infer<typeof listSourcesOutputSchema>;
export type ExplainQueryInput = z.infer<typeof explainQueryInputSchema>;
export type ExplainQueryOutput = z.infer<typeof explainQueryOutputSchema>;
export type ErrorOutput = z.infer<typeof errorOutputSchema>;
export type ClarificationOutput = z.infer<typeof clarificationOutputSchema>;
export type RejectedOutput = z.infer<typeof rejectedOutputSchema>;
