/** The SQAI client: a thin, policy-checked facade over the runtime.
 *
 * Query plane   — connect / resolve / query / verify / ask, in-process.
 * Computation   — validate against the capability contract, resolve bindings
 *                 through the upstream aligned extraction primitive, delegate
 *                 to the managed runtime, pass results through verbatim.
 */

import { randomBytes } from "node:crypto";
import { arch as osArch } from "node:os";
import { Runtime } from "algenta-sdk";

import contractData from "./contract-data.json" with { type: "json" };
import { ContractIndex, type CapabilityContract, type CapabilityMatch } from "./contract.js";
import { SqaiError, fromEngineError } from "./errors.js";
import { inferMode, readEnv, type SqaiMode } from "./env.js";
import { checkFieldAllowed, checkSourceAllowed, type SqaiPolicy } from "./policy.js";
import { computationHash, inputHash, invocationHash } from "./hashes.js";
import { ResultStore } from "./results.js";
import { RuntimeProvisioner, currentPlatformKey, type RuntimeStatus } from "./runtime/provision.js";
import {
  dispatchComputation,
  type DispatchTarget,
} from "./compute/dispatch.js";
import { validateComputation, type ResolvedBindingValue } from "./compute/validate.js";
import type {
  SqaiValue,
  AskOutcome,
  ColumnExtract,
  ComputationBinding,
  ComputationSpec,
  ComputeResult,
  SqaiConnectorBrowseResult,
  SqaiConnectorCreateRequest,
  SqaiConnectorInfo,
  SqaiConnectorListResult,
  SqaiConnectorPreview,
  SqaiConnectorTestResult,
  SqaiConnectorUpdateRequest,
  SqaiManagedConnectOptions,
  QueryResponse,
  QueryWithMetadataResponse,
  QuerySpec,
  ResolveResponse,
  ResolvedPlan,
  ResultStoreConfig,
  SourceRegistrationResponse,
  SqaiIntent,
  SqaiOutcome,
  SqaiResultRecord,
  SqaiSource,
  VerifyResponse,
} from "./types.js";

export interface SqaiConfig {
  mode?: SqaiMode;
  apiKey?: string;
  /** Public SQAI deployment URL. */
  deploymentUrl?: string;
  tenantId?: string;
  policy?: SqaiPolicy;
  enforceLimits?: boolean;
  /** Milliseconds. Applies to HTTP transport AND, on the computation plane,
   * rides to the daemon as an enforced per-request timeout (it can lower the
   * daemon's ceiling, never raise it) — never advisory. */
  timeout?: number;
  maxRetries?: number;
  resultStore?: ResultStoreConfig;
  /**
   * Build-on-provision module filter. All 4,762 functions are available in the
   * contract; set this to install only the modules you use. The build service
   * compiles + signs a bundle for exactly this set (cached by filter-hash).
   * Omit for the default pinned bundle. Env: SQAI_RUNTIME_MODULES (comma-separated).
   */
  runtimeModules?: string[];
  /** Build service endpoint for filtered bundles. Env: SQAI_BUILD_SERVICE_URL. */
  buildServiceUrl?: string;
  /** BYO runtime (tests / custom SQAI deployments). */
  runtime?: unknown;
  /** BYO computation dispatch target (tests / custom SQAI deployments). */
  computeTarget?: DispatchTarget;
}

/** The subset of the runtime surface SQAI consumes. Optional members exist
 * only in newer builds; SQAI fails structured when absent. */
interface RuntimeLike {
  connect(
    source: unknown,
    options?: SqaiManagedConnectOptions,
  ): Promise<SourceRegistrationResponse>;
  createConnector?(request: SqaiConnectorCreateRequest): Promise<SqaiConnectorInfo>;
  listConnectors?(options?: { page?: number; limit?: number }): Promise<SqaiConnectorListResult>;
  getConnector?(connectorId: string): Promise<SqaiConnectorInfo>;
  updateConnector?(
    connectorId: string,
    request: SqaiConnectorUpdateRequest,
  ): Promise<SqaiConnectorInfo>;
  testConnector?(connectorIdOrConnector: string | SqaiConnectorPreview): Promise<SqaiConnectorTestResult>;
  browseConnector?(
    connectorIdOrConnector: string | SqaiConnectorPreview,
  ): Promise<SqaiConnectorBrowseResult>;
  deleteConnector?(connectorId: string): Promise<void>;
  resolve(request?: Record<string, unknown>): Promise<ResolveResponse>;
  query(request: ResolvedPlan | ResolveResponse | Record<string, unknown>): Promise<QueryResponse>;
  queryWithMetadata(
    request: ResolvedPlan | ResolveResponse | Record<string, unknown>,
  ): Promise<QueryWithMetadataResponse>;
  verify(request: ResolvedPlan | ResolveResponse | Record<string, unknown>): Promise<VerifyResponse>;
  extractColumns?(
    sourceName: string,
    columns: string[],
    options?: {
      filter?: Record<string, unknown>;
      limit?: number;
      nullPolicy?: "pairwise" | "preserve";
    },
  ): Promise<ColumnExtract>;
}

export class SQAI {
  readonly mode: SqaiMode;
  private readonly runtimeClient: RuntimeLike;
  private readonly rawRuntime: Runtime;
  private readonly policy: SqaiPolicy | undefined;
  private readonly tenantId: string | null;
  private readonly deploymentUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly contractIndex: ContractIndex;
  private readonly resultStore: ResultStore;
  private readonly provisioner: RuntimeProvisioner;
  private readonly configuredTarget: DispatchTarget | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly sources = new Map<string, SqaiSource>();

  constructor(config: SqaiConfig = {}) {
    const env = readEnv();
    this.mode = inferMode(config.mode, env);
    this.apiKey = config.apiKey ?? env.apiKey;
    this.deploymentUrl = config.deploymentUrl ?? env.deploymentUrl;
    this.tenantId = config.tenantId ?? null;
    this.policy = config.policy;
    this.configuredTarget = config.computeTarget;
    this.timeoutMs = config.timeout;
    this.contractIndex = new ContractIndex(contractData as unknown as CapabilityContract);
    this.resultStore = new ResultStore(config.resultStore);
    this.provisioner = new RuntimeProvisioner({
      contract: this.contractIndex.contract,
      autoInstall: env.autoInstall,
      runtimeModules: config.runtimeModules ?? env.runtimeModules,
      buildServiceUrl: config.buildServiceUrl ?? env.buildServiceUrl,
    });

    if (config.runtime) {
      this.rawRuntime = config.runtime as Runtime;
    } else {
      // The substrate treats a PRESENT apiKey key as explicit — even when
      // undefined — and flips on hosted-local enforcement. Spread conditionally.
      this.rawRuntime = new Runtime({
        mode: this.mode === "deployment" ? "self_hosted" : this.mode === "api" ? "api" : "local",
        ...(this.apiKey ? { apiKey: this.apiKey } : {}),
        ...(this.mode === "deployment" && this.deploymentUrl ? { baseUrl: this.deploymentUrl } : {}),
        ...(config.enforceLimits !== undefined ? { enforceLimits: config.enforceLimits } : {}),
        ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
        ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      } as ConstructorParameters<typeof Runtime>[0]);
    }
    this.runtimeClient = this.rawRuntime as unknown as RuntimeLike;
  }

  // ── Query plane ────────────────────────────────────────────────────────────

  async connect(
    source: string | Array<Record<string, unknown>> | Record<string, unknown> | null = null,
    options: SqaiManagedConnectOptions = {},
  ): Promise<SqaiSource> {
    try {
      const registration = await this.runtimeClient.connect(source, options);
      const mapped = mapSource(registration);
      if (this.sources.has(mapped.name)) {
        const existing = this.sources.get(mapped.name) as SqaiSource;
        if (existing.schema_revision !== mapped.schema_revision) {
          // Connected sources are immutable: a name can never be re-bound to
          // different data underneath a running agent.
          throw new SqaiError(
            "source_already_registered",
            `Source '${mapped.name}' is already registered; connected sources are immutable.`,
            { details: { source: mapped.name } },
          );
        }
        return existing;
      }
      checkSourceAllowed(this.policy, mapped.name);
      this.sources.set(mapped.name, mapped);
      return mapped;
    } catch (error) {
      throw error instanceof SqaiError ? error : fromEngineError(error);
    }
  }

  async createConnector(request: SqaiConnectorCreateRequest): Promise<SqaiConnectorInfo> {
    const createConnector = this.runtimeClient.createConnector;
    if (typeof createConnector !== "function") {
      throw unsupportedSubstrateOperation("createConnector");
    }
    try {
      return await createConnector.call(this.runtimeClient, request);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async listConnectors(
    options: { page?: number; limit?: number } = {},
  ): Promise<SqaiConnectorListResult> {
    const listConnectors = this.runtimeClient.listConnectors;
    if (typeof listConnectors !== "function") {
      throw unsupportedSubstrateOperation("listConnectors");
    }
    try {
      return await listConnectors.call(this.runtimeClient, options);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async getConnector(connectorId: string): Promise<SqaiConnectorInfo> {
    const getConnector = this.runtimeClient.getConnector;
    if (typeof getConnector !== "function") {
      throw unsupportedSubstrateOperation("getConnector");
    }
    try {
      return await getConnector.call(this.runtimeClient, connectorId);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async updateConnector(
    connectorId: string,
    request: SqaiConnectorUpdateRequest,
  ): Promise<SqaiConnectorInfo> {
    const updateConnector = this.runtimeClient.updateConnector;
    if (typeof updateConnector !== "function") {
      throw unsupportedSubstrateOperation("updateConnector");
    }
    try {
      return await updateConnector.call(this.runtimeClient, connectorId, request);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async testConnector(
    connectorIdOrConnector: string | SqaiConnectorPreview,
  ): Promise<SqaiConnectorTestResult> {
    const testConnector = this.runtimeClient.testConnector;
    if (typeof testConnector !== "function") {
      throw unsupportedSubstrateOperation("testConnector");
    }
    try {
      return await testConnector.call(this.runtimeClient, connectorIdOrConnector);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async browseConnector(
    connectorIdOrConnector: string | SqaiConnectorPreview,
  ): Promise<SqaiConnectorBrowseResult> {
    const browseConnector = this.runtimeClient.browseConnector;
    if (typeof browseConnector !== "function") {
      throw unsupportedSubstrateOperation("browseConnector");
    }
    try {
      return await browseConnector.call(this.runtimeClient, connectorIdOrConnector);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async deleteConnector(connectorId: string): Promise<void> {
    const deleteConnector = this.runtimeClient.deleteConnector;
    if (typeof deleteConnector !== "function") {
      throw unsupportedSubstrateOperation("deleteConnector");
    }
    try {
      await deleteConnector.call(this.runtimeClient, connectorId);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  listSources(): SqaiSource[] {
    return [...this.sources.values()];
  }

  async resolve(spec: QuerySpec): Promise<ResolveResponse> {
    this.checkQueryPolicy(spec);
    try {
      return await this.runtimeClient.resolve(spec as unknown as Record<string, unknown>);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async query(plan: ResolvedPlan | ResolveResponse): Promise<QueryResponse> {
    try {
      return await this.runtimeClient.query(plan);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async queryWithMetadata(plan: ResolvedPlan | ResolveResponse): Promise<QueryWithMetadataResponse> {
    try {
      return await this.runtimeClient.queryWithMetadata(plan);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async verify(plan: ResolvedPlan | ResolveResponse): Promise<VerifyResponse> {
    try {
      return await this.runtimeClient.verify(plan);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  async ask(spec: QuerySpec): Promise<AskOutcome> {
    const resolution = await this.resolve(spec);
    if (resolution.clarification_required) {
      return { status: "needs_clarification", resolution };
    }
    if (resolution.rejection_reason || !resolution.resolved_plan) {
      return { status: "rejected", resolution };
    }
    const data = await this.query(resolution);
    return { status: "ok", data, resolution };
  }

  async extractColumns(
    sourceName: string,
    columns: string[],
    options: {
      filter?: Record<string, unknown>;
      limit?: number;
      nullPolicy?: "pairwise" | "preserve";
    } = {},
  ): Promise<ColumnExtract> {
    checkSourceAllowed(this.policy, sourceName);
    for (const column of columns) {
      checkFieldAllowed(this.policy, sourceName, column);
    }
    if (typeof this.runtimeClient.extractColumns !== "function") {
      throw new SqaiError(
        "unsupported_operation",
        "The installed SQAI package does not provide extractColumns; upgrade SQAI.",
        { details: { required: "sqai.extractColumns" } },
      );
    }
    try {
      return await this.runtimeClient.extractColumns(sourceName, columns, options);
    } catch (error) {
      throw fromEngineError(error);
    }
  }

  // ── Computation plane ──────────────────────────────────────────────────────

  async compute(spec: ComputationSpec): Promise<ComputeResult> {
    const resolvedBindings = await this.resolveBindings(spec.bindings ?? []);
    const validated = validateComputation(spec, this.contractIndex, this.policy, resolvedBindings);

    const requestId = `sqai_${randomBytes(8).toString("hex")}`;
    const target = await this.dispatchTarget();
    const outcome = await dispatchComputation(
      target,
      validated.entry,
      validated.argsVector,
      validated.seed,
      requestId,
      this.timeoutMs === undefined ? undefined : Math.ceil(this.timeoutMs / 1000),
    );

    const contractHash = this.contractIndex.contract.capability_contract_hash;
    const inputHashValue = inputHash(validated.argsVector);
    const invocation = invocationHash({
      module: spec.module,
      function: spec.function,
      args: spec.args ?? [],
      kwargs: spec.kwargs ?? {},
      resolved_bindings: resolvedBindings.map(binding => ({
        parameter: binding.parameter,
        source_name: binding.provenance.source_name,
        fields: binding.provenance.fields,
        input_hash: binding.provenance.input_hash,
      })),
      seed: validated.seed,
      contract_hash: contractHash,
      execution_scope: `${currentPlatformKey()}:${this.mode}`,
    });

    const bundle = this.contractIndex.contract.runtime_bundle;
    const platformBundle = bundle.platforms[currentPlatformKey()];
    return {
      status: "ok",
      value: outcome.value,
      value_type: validated.entry.signature.returns,
      module: spec.module,
      function: spec.function,
      ...(validated.seed === null ? {} : { seed: validated.seed }),
      invocation_hash: invocation,
      computation_hash: computationHash(invocation, outcome.value),
      contract_hash: contractHash,
      determinism: {
        runtime_bundle_version: bundle.version || "unmanaged",
        runtime_bundle_sha256: platformBundle?.sha256 ?? "unmanaged",
        platform: currentPlatformKey(),
        architecture: osArch(),
        kernel_build: outcome.engine_used,
        precision_mode: "float64",
        thread_count: 1,
        ...(validated.seed === null ? {} : { seed: validated.seed }),
        input_hash: inputHashValue,
      },
      ...(resolvedBindings.length > 0
        ? { provenance: { bindings: resolvedBindings.map(binding => binding.provenance) } }
        : {}),
      latency_ms: outcome.latency_ms,
      request_id: outcome.request_id,
    };
  }

  async run(intent: SqaiIntent): Promise<SqaiOutcome> {
    if (!intent || intent.version !== "1") {
      throw new SqaiError("invalid_intent", "Intent version must be '1'.", {
        details: { received: (intent as { version?: unknown })?.version ?? null },
      });
    }
    if (intent.kind === "query") {
      return { kind: "query", outcome: await this.ask(intent.spec) };
    }
    if (intent.kind === "computation") {
      return { kind: "computation", outcome: await this.compute(intent.spec) };
    }
    throw new SqaiError("invalid_intent", "Intent kind must be 'query' or 'computation'.", {
      details: { received: (intent as { kind?: unknown }).kind ?? null },
    });
  }

  // ── Introspection / lifecycle ──────────────────────────────────────────────

  capabilities(): CapabilityContract {
    return this.contractIndex.contract;
  }

  searchCapabilities(query: string, limit = 10): CapabilityMatch[] {
    return this.contractIndex.search(query, limit);
  }

  storeResult(value: unknown, sourceIds: string[] = []): string {
    return this.resultStore.store(value, { tenantId: this.tenantId, sourceIds });
  }

  getResult(resultId: string): SqaiResultRecord {
    return this.resultStore.get(resultId, this.tenantId);
  }

  deleteResult(resultId: string): void {
    this.resultStore.delete(resultId, this.tenantId);
  }

  readonly runtime = {
    status: (): Promise<RuntimeStatus> => this.provisioner.status(),
    ensure: async (): Promise<void> => {
      await this.provisioner.ensure();
    },
    stop: (): Promise<void> => this.provisioner.stop(),
  };

  // ── Internals ──────────────────────────────────────────────────────────────

  private checkQueryPolicy(spec: QuerySpec): void {
    if (spec.source_name) {
      checkSourceAllowed(this.policy, spec.source_name);
      checkFieldAllowed(this.policy, spec.source_name, spec.metric);
      if (spec.group_by) {
        checkFieldAllowed(this.policy, spec.source_name, spec.group_by);
      }
      for (const condition of spec.filter?.conditions ?? []) {
        if (condition.column) {
          checkFieldAllowed(this.policy, spec.source_name, condition.column);
        }
      }
    }
  }

  private async dispatchTarget(): Promise<DispatchTarget> {
    if (this.configuredTarget) {
      return this.configuredTarget;
    }
    if (this.mode === "deployment" && this.deploymentUrl) {
      return { kind: "http", baseUrl: this.deploymentUrl, ...(this.apiKey ? { apiKey: this.apiKey } : {}) };
    }
    if (this.mode === "api") {
      if (!this.apiKey) {
        throw new SqaiError(
          "compute_runtime_unavailable",
          "API mode requires SQAI_API_KEY for the computation plane.",
        );
      }
      return { kind: "http", baseUrl: "https://api.sqai.com", apiKey: this.apiKey };
    }
    const runtime = await this.provisioner.ensure();
    return { kind: "local", runtime };
  }

  private async resolveBindings(bindings: ComputationBinding[]): Promise<ResolvedBindingValue[]> {
    const resolved: ResolvedBindingValue[] = [];
    for (const binding of bindings) {
      if ("parameters" in binding) {
        const extract = await this.extractColumns(binding.source, binding.fields, {
          ...(binding.filter ? { filter: binding.filter as Record<string, unknown> } : {}),
          nullPolicy: binding.nullPolicy ?? "pairwise",
        });
        binding.parameters.forEach((parameter, index) => {
          const field = binding.fields[index];
          if (field === undefined) {
            throw new SqaiError(
              "invalid_intent",
              "Aligned bindings need one field per parameter.",
              { details: { parameters: binding.parameters, fields: binding.fields } },
            );
          }
          resolved.push({
            parameter,
            values: (extract.columns[field] ?? []) as SqaiValue,
            provenance: {
              source_name: extract.source_name,
              fields: [field],
              schema_revision: extract.schema_revision,
              row_count: extract.row_count,
              input_hash: extract.input_hash,
            },
          });
        });
      } else {
        const extract = await this.extractColumns(binding.source, [binding.field], {
          ...(binding.filter ? { filter: binding.filter as Record<string, unknown> } : {}),
          nullPolicy: "pairwise",
        });
        resolved.push({
          parameter: binding.parameter,
          values: (extract.columns[binding.field] ?? []) as SqaiValue,
          provenance: {
            source_name: extract.source_name,
            fields: [binding.field],
            schema_revision: extract.schema_revision,
            row_count: extract.row_count,
            input_hash: extract.input_hash,
          },
        });
      }
    }
    return resolved;
  }
}

export function createSQAI(config: SqaiConfig = {}): SQAI {
  return new SQAI(config);
}

function unsupportedSubstrateOperation(operation: string): SqaiError {
  return new SqaiError(
    "unsupported_operation",
    `The installed SQAI package does not provide ${operation}; upgrade SQAI.`,
    { details: { required: `sqai.${operation}` } },
  );
}

function mapSource(registration: SourceRegistrationResponse): SqaiSource {
  const record = registration as SourceRegistrationResponse & {
    source_schema?: { typed_fields?: Array<{ name: string; type: string }> } | null;
    schema?: { fields?: string[] } | null;
  };
  return {
    name: String(registration.name ?? ""),
    source_id: registration.source_id ?? null,
    dataset_id: registration.dataset_id ?? null,
    fields: record.schema?.fields ?? [],
    typed_fields: record.source_schema?.typed_fields ?? [],
    row_count: registration.row_count ?? null,
    schema_revision:
      (registration as { planner_schema_revision?: string }).planner_schema_revision ??
      (registration as { schema_revision?: string }).schema_revision ??
      null,
    status: String(registration.status ?? "ready"),
  };
}
