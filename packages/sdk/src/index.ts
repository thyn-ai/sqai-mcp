export { SQAI, createSQAI, type SqaiConfig } from "./sqai.js";
export { SqaiError, SQAI_ERROR_CODES, type SqaiErrorSource } from "./errors.js";
export { type SqaiPolicy } from "./policy.js";
export {
  ContractIndex,
  isReadOnlyEligible,
  type CapabilityContract,
  type CapabilityEntry,
  type CapabilityMatch,
} from "./contract.js";
export { invocationHash, computationHash, inputHash, type InvocationIdentity } from "./hashes.js";
export { ResultStore } from "./results.js";
export {
  RuntimeProvisioner,
  currentPlatformKey,
  runtimeCacheDir,
  type RuntimeStatus,
} from "./runtime/provision.js";
export { login, logout, sqaiHome, readCachedApiKey, ensureLocalLoginKey, LoginError, type LoginResult } from "./runtime/auth.js";
export {
  validateComputation,
  lookupCapability,
  type ResolvedBindingValue,
  type ValidatedComputation,
} from "./compute/validate.js";
export { SQAI_CONNECTOR_TYPES, SQAI_CONNECTOR_TYPE_ALIASES } from "./types.js";
export type {
  SqaiValue,
  AskOutcome,
  BindingProvenance,
  ColumnExtract,
  ComputationBinding,
  ComputationSpec,
  ComputeResult,
  DeterminismEnvelope,
  SqaiConnectorBrowseResult,
  SqaiConnectorConfig,
  SqaiConnectorCreateRequest,
  SqaiConnectorInfo,
  SqaiConnectorListResult,
  SqaiConnectorPreview,
  SqaiConnectorTestResult,
  SqaiConnectorType,
  SqaiConnectorUpdateRequest,
  SqaiManagedConnectOptions,
  QueryFilterCondition,
  QueryFilterSpec,
  QueryResponse,
  QuerySpec,
  QueryWithMetadataResponse,
  ResultStoreConfig,
  ResolveResponse,
  ResolvedPlan,
  SourceRegistrationResponse,
  SqaiIntent,
  SqaiOutcome,
  SqaiResultRecord,
  SqaiSource,
  VerifyResponse,
} from "./types.js";
