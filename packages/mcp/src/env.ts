/** MCP-server environment surface.
 *
 * SQAI_API_KEY / SQAI_DEPLOYMENT_URL are NOT read here: their semantics are
 * owned by @thyn-ai/sqai (packages/sdk/src/env.ts) and applied when the
 * toolkit constructs its client. This module owns exactly one additional
 * variable — SQAI_SOURCES, a JSON array of SqaiSourceInput — and validates it
 * before the server starts serving.
 *
 * Zero env is a valid configuration: no sources, local mode, in-process query
 * plane. initialize and tools/list must work in that state (they need no
 * sources, and source connections are lazy in the toolkit). */

import { z } from "zod";
import type { SqaiSourceInput } from "@thyn-ai/sqai-ai-sdk";

/** Mirrors the SqaiSourceInput union from @thyn-ai/sqai-ai-sdk so a malformed
 * SQAI_SOURCES fails at startup with a precise message instead of surfacing
 * later as a connection error. */
const recordArraySchema = z.array(z.record(z.string(), z.unknown()));
const sqaiSourceInputSchema: z.ZodType<SqaiSourceInput> = z.union([
  z.string(),
  recordArraySchema,
  z.object({
    data: z.union([z.string(), recordArraySchema]),
    name: z.string().optional(),
  }),
]);
const sourcesSchema = z.array(sqaiSourceInputSchema);

export class SourcesEnvError extends Error {
  readonly code = "invalid_sources_env" as const;
  constructor(message: string) {
    super(message);
    this.name = "SourcesEnvError";
  }
}

/** Parse and validate SQAI_SOURCES. Unset or blank means "no sources".
 * Throws SourcesEnvError on malformed JSON or a shape that is not
 * SqaiSourceInput[] — the caller turns that into a fail-fast startup error. */
export function readSourcesFromEnv(env: NodeJS.ProcessEnv = process.env): SqaiSourceInput[] {
  const raw = (env.SQAI_SOURCES ?? "").trim();
  if (raw.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SourcesEnvError(
      `SQAI_SOURCES is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = sourcesSchema.safeParse(parsed);
  if (!result.success) {
    throw new SourcesEnvError(
      `SQAI_SOURCES must be a JSON array of SqaiSourceInput ` +
        `(string path/URL, array of row objects, or { data, name? }): ${result.error.issues
          .map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; ")}`,
    );
  }
  return result.data;
}
