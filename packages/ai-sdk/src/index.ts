export { createSQAI, SQAIToolkit, type SqaiSourceInput, type SqaiToolkitConfig } from "./toolkit.js";
export { createSqaiTools, type SqaiTool, type SqaiToolSet, type SqaiToolsOptions } from "./tools.js";
export {
  shapeComputationValue,
  shapeQueryResult,
  storeWithinCap,
  type Cell,
  type ComputationShapingOptions,
  type QueryShapingOptions,
  type ShapedComputationValue,
  type ShapedQueryResult,
} from "./truncate.js";
export * from "./schemas.js";

// Substrate types agents commonly need alongside the tools.
export { SQAI, SqaiError, ensureLocalLoginKey } from "@thyn-ai/sqai";
export type {
  SqaiValue,
  ComputationBinding,
  ComputationSpec,
  ComputeResult,
  QueryFilterCondition,
  QueryFilterSpec,
  QuerySpec,
  SqaiConfig,
  SqaiPolicy,
  SqaiSource,
} from "@thyn-ai/sqai";
