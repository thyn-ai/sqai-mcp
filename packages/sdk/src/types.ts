/** Public SQAI types. */

/** Contract-derived wire value: everything the computation plane can
 * transport. The wire schema transports; the capability contract authorizes. */
export type SqaiValue =
  | null
  | boolean
  | number
  | string
  | SqaiValue[]
  | { [key: string]: SqaiValue }
  | { type: "decimal" | "bigint"; value: string };

export interface SqaiSource {
  name: string;
  source_id: string | null;
  dataset_id: string | null;
  fields: string[];
  typed_fields: Array<{ name: string; type: string }>;
  row_count: number | null;
  schema_revision: string | null;
  status: string;
}

export type SqaiConnectorConfig = Record<string, unknown>;

export const SQAI_CONNECTOR_TYPES = [
  "s3",
  "gcs",
  "azure",
  "clickhouse",
  "bigquery",
  "snowflake",
  "redshift",
  "postgres",
  "postgresql",
  "sqlite",
  "mysql",
  "mssql",
  "oracle",
  "neo4j",
  "redis",
  "elastic",
  "elasticsearch",
  "rest",
  "rest_api",
  "file",
  "file_upload",
  "github_repo",
  "gitlab_repo",
  "bitbucket_repo",
  "local_repo",
  "repo_archive",
] as const;

export type SqaiConnectorType = (typeof SQAI_CONNECTOR_TYPES)[number];

export const SQAI_CONNECTOR_TYPE_ALIASES: Readonly<Record<string, SqaiConnectorType>> = {
  postgresql: "postgres",
  click_house: "clickhouse",
  redis_cache: "redis",
  elastic: "elasticsearch",
  rest_api: "rest",
  file_upload: "file",
  github: "github_repo",
  github_repository: "github_repo",
  gitlab: "gitlab_repo",
  gitlab_repository: "gitlab_repo",
  bitbucket: "bitbucket_repo",
  bitbucket_repository: "bitbucket_repo",
  local_repository: "local_repo",
  archive_repository: "repo_archive",
};

export interface SqaiConnectorPreview {
  type?: SqaiConnectorType | string;
  connector_type?: SqaiConnectorType | string;
  provider?: string;
  [key: string]: unknown;
}

export interface SqaiManagedConnectOptions {
  name?: string;
  description?: string;
  connectorId?: string;
  connector?: SqaiConnectorPreview;
  selection?: Record<string, unknown>;
  datasetName?: string;
  persist?: boolean;
  visibility?: string;
  connectionName?: string;
}

export interface SqaiConnectorCreateRequest {
  name: string;
  connectorType: SqaiConnectorType | string;
  config?: SqaiConnectorConfig;
  description?: string;
  visibility?: string;
}

export interface SqaiConnectorUpdateRequest {
  name?: string;
  description?: string;
  visibility?: string;
  config?: SqaiConnectorConfig;
}

export interface SqaiConnectorInfo {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  visibility: string;
  description?: string | null;
  last_tested_at?: string | null;
  error_message?: string | null;
  created_at?: string;
}

export interface SqaiConnectorListResult {
  connectors: SqaiConnectorInfo[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface SqaiConnectorTestResult {
  success: boolean;
  message: string;
  latency_ms?: number | null;
  status?: string | null;
  error_type?: string | null;
  recoverable?: boolean | null;
}

export interface SqaiConnectorBrowseResult {
  connector_type: string;
  items: Array<Record<string, unknown>>;
  total: number;
  message: string;
  labels: Record<string, unknown>;
  discovery: Record<string, unknown>;
}

export interface QueryFilterCondition {
  column?: string;
  dimension_hint?: string;
  op: "eq" | "in" | "gt" | "gte" | "lt" | "lte" | "is_null" | "is_not_null";
  value?: string | number | boolean;
  values?: Array<string | number | boolean>;
}

export interface QueryFilterSpec {
  time_filter?: string;
  conditions?: QueryFilterCondition[];
}

export interface QueryCandidate {
  source: string;
  column: string;
  role: string;
  magnitude?: string | null;
  formula?: string | null;
  confidence: number;
  score_components?: Record<string, number>;
  notes?: string[];
}

export interface ResolvedPlan {
  source_name: string;
  metric_column: string;
  aggregation: string;
  group_column?: string | null;
  join_path?: Record<string, unknown> | null;
  filter?: QueryFilterSpec | null;
  limit?: number | null;
  order?: string;
  constraints?: Record<string, unknown>;
  schema_revision: string;
}

export interface ResolveResponse {
  resolved_plan?: ResolvedPlan | null;
  confidence: number;
  plan: string[];
  explanation: string[];
  resolved_column: string;
  resolved_role: string;
  resolved_source: string;
  candidates: QueryCandidate[];
  source_scores: Record<string, number>;
  latency_ms: number;
  decision_path: string;
  plan_hash?: string | null;
  schema_revision: string;
  validated: boolean;
  deterministic_scope: string;
  confidence_source: string;
  clarification_required?: boolean;
  rejection_reason?: string | null;
  request_id?: string | null;
  intent_signature: string;
  source_set?: string[];
  join_path?: Array<Record<string, unknown>>;
  planner_mode?: string | null;
}

export interface QueryResponse {
  query_id: string;
  result: unknown;
  result_type: string;
  confidence: number;
  plan: string[];
  resolved_column: string;
  resolved_role: string;
  resolved_source: string;
  row_count: number;
  candidates: QueryCandidate[];
  source_scores: Record<string, number>;
  ambiguous: boolean;
  exact_spec: boolean;
  explanation: string[];
  latency_ms: number;
  decision_path: string;
  plan_hash: string;
  schema_revision?: string | null;
  validated: boolean;
  deterministic_scope: string;
  confidence_source: string;
  clarification_required?: boolean;
  rejection_reason?: string | null;
  request_id?: string | null;
  source_set?: string[];
  join_path?: Array<Record<string, unknown>>;
  planner_mode?: string | null;
}

export interface QueryExecutionMetadata {
  request_id?: string | null;
  latency_ms?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  cache_hit?: boolean | null;
}

export interface QueryWithMetadataResponse {
  data: QueryResponse;
  metadata: QueryExecutionMetadata;
  headers?: Record<string, string> | null;
}

export interface VerifyResponse {
  valid: boolean;
  errors: string[];
  suggestions: string[];
  resolved: Record<string, string>;
  valid_dimensions?: string[];
  valid_measures?: string[];
  source_behavior?: string;
  latency_ms: number;
  verified?: boolean;
  request_id?: string | null;
  schema_revision?: string | null;
  plan_hash?: string | null;
  verification_mode?: string;
  rejection_reason?: string | null;
}

export interface SourceRegistrationResponse {
  source_id?: string | null;
  dataset_id?: string | null;
  name?: string | null;
  dataset_name?: string | null;
  status: string;
  ingest_mode?: string | null;
  schema?: Record<string, unknown> | null;
  source_schema?: Record<string, unknown> | null;
  planner_cache_hit?: boolean | null;
  planner_schema_revision?: string | null;
  planner_prewarm_ms?: number | null;
  latency_ms?: number | null;
  row_count?: number | null;
  typed_fields?: Array<{ name: string; type: string }> | null;
  [key: string]: unknown;
}

/** The caller/model-authored resolve-spec. */
export interface QuerySpec {
  metric: string;
  aggregation?: "sum" | "avg" | "count" | "min" | "max";
  group_by?: string;
  filter?: QueryFilterSpec;
  limit?: number;
  order?: "asc" | "desc";
  source_name?: string;
}

export type ComputationBinding =
  | {
      parameter: string | number;
      source: string;
      field: string;
      filter?: QueryFilterSpec;
    }
  | {
      parameters: Array<string | number>;
      source: string;
      fields: string[];
      filter?: QueryFilterSpec;
      alignment: "rowwise";
      nullPolicy?: "pairwise" | "preserve";
    };

export interface ComputationSpec {
  module: string;
  function: string;
  args?: SqaiValue[];
  kwargs?: Record<string, SqaiValue>;
  bindings?: ComputationBinding[];
  seed?: number | string;
}

export type SqaiIntent =
  | { version: "1"; kind: "query"; spec: QuerySpec }
  | { version: "1"; kind: "computation"; spec: ComputationSpec };

export interface DeterminismEnvelope {
  runtime_bundle_version: string;
  runtime_bundle_sha256: string;
  platform: string;
  architecture: string;
  kernel_build: string;
  precision_mode: string;
  thread_count: number;
  seed?: number | string;
  input_hash: string;
}

export interface BindingProvenance {
  source_name: string;
  fields: string[];
  schema_revision: string | null;
  row_count: number;
  input_hash: string;
}

export interface ComputeResult {
  status: "ok";
  value: SqaiValue;
  value_type: string;
  module: string;
  function: string;
  seed?: number | string;
  invocation_hash: string;
  computation_hash: string;
  contract_hash: string;
  determinism: DeterminismEnvelope;
  provenance?: { bindings: BindingProvenance[] };
  latency_ms: number;
  request_id: string;
}

export type AskOutcome =
  | { status: "ok"; data: QueryResponse; resolution: ResolveResponse }
  | { status: "needs_clarification"; resolution: ResolveResponse }
  | { status: "rejected"; resolution: ResolveResponse };

export type SqaiOutcome =
  | { kind: "query"; outcome: AskOutcome }
  | { kind: "computation"; outcome: ComputeResult };

export interface ColumnExtract {
  columns: Record<string, Array<number | null>>;
  row_count: number;
  source_name: string;
  schema_revision: string | null;
  alignment: "rowwise";
  input_hash: string;
}

export interface SqaiResultRecord {
  result_id: string;
  tenant_id: string | null;
  source_ids: string[];
  created_at: number;
  expires_at: number;
  byte_size: number;
  value: unknown;
}

export interface ResultStoreConfig {
  ttlMs?: number;
  maxResultCount?: number;
  maxStoredResultBytes?: number;
  maxTenantResultBytes?: number;
}
