/** SQAIToolkit: an SQAI client plus declarative sources and AI-SDK tools.
 *
 * Sources connect lazily — on first `ready` access or first tool call. The
 * connection promise gets a rejection handler the moment it is created, so a
 * failed connect never surfaces as an unhandled rejection: every tool call
 * reports the stored failure as a structured error result instead. */

import { SQAI, SqaiError, type SqaiConfig, type SqaiSource } from "@thyn-ai/sqai";

import { createSqaiTools, type SqaiToolSet, type SqaiToolsOptions } from "./tools.js";

export type SqaiSourceInput =
  | string
  | Array<Record<string, unknown>>
  | { data: string | Array<Record<string, unknown>>; name?: string };

export interface SqaiToolkitConfig extends SqaiConfig {
  /** Sources to connect lazily on first tool call / `ready` access. */
  sources?: SqaiSourceInput[];
}

export class SQAIToolkit {
  readonly client: SQAI;
  private readonly sourceInputs: SqaiSourceInput[];
  private readyPromise: Promise<SqaiSource[]> | null = null;
  private readyError: SqaiError | null = null;

  constructor(config: SqaiToolkitConfig = {}) {
    const { sources, ...clientConfig } = config;
    this.client = new SQAI(clientConfig);
    this.sourceInputs = sources ?? [];
  }

  /** Connected sources; connecting starts on first access. */
  get ready(): Promise<SqaiSource[]> {
    return this.ensureReady();
  }

  /** The stored connection failure, when `ready` rejected. */
  get connectionError(): SqaiError | null {
    return this.readyError;
  }

  ensureReady(): Promise<SqaiSource[]> {
    if (!this.readyPromise) {
      this.readyPromise = this.connectAll();
      this.readyPromise.catch(error => {
        this.readyError =
          error instanceof SqaiError
            ? error
            : new SqaiError(
                "source_connection_failed",
                `Connecting the configured sources failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
      });
    }
    return this.readyPromise;
  }

  async connect(
    source: string | Array<Record<string, unknown>> | Record<string, unknown>,
    options: { name?: string } = {},
  ): Promise<SqaiSource> {
    return this.client.connect(source, options);
  }

  tools(options: SqaiToolsOptions = {}): SqaiToolSet {
    return createSqaiTools(this, options);
  }

  private async connectAll(): Promise<SqaiSource[]> {
    for (const input of this.sourceInputs) {
      if (typeof input === "string" || Array.isArray(input)) {
        await this.client.connect(input);
      } else {
        await this.client.connect(input.data, input.name ? { name: input.name } : {});
      }
    }
    return this.client.listSources();
  }
}

export function createSQAI(config: SqaiToolkitConfig = {}): SQAIToolkit {
  return new SQAIToolkit(config);
}
