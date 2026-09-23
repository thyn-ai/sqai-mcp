/** SQAI_* environment mapping and zero-config mode inference.
 *
 * Inference order (explicit config always overrides):
 *   SQAI_DEPLOYMENT_URL present -> "deployment"
 *   otherwise               -> "local"
 */

export type SqaiMode = "local" | "api" | "deployment";

/** Managed build-on-provision service for filtered runtimes. Overridable via
 * SQAI_BUILD_SERVICE_URL (or the buildServiceUrl config) for private deployment builders. */
export const DEFAULT_BUILD_SERVICE_URL = "https://sqai-buildservice.fly.dev";

export interface ResolvedEnv {
  apiKey: string | undefined;
  deploymentUrl: string | undefined;
  autoInstall: boolean;
  runtimeModules: string[] | undefined;
  buildServiceUrl: string | undefined;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ResolvedEnv {
  const apiKey = (env.SQAI_API_KEY ?? "").trim() || undefined;
  const deploymentUrl = (env.SQAI_DEPLOYMENT_URL ?? "").trim() || undefined;
  const autoInstall = (env.SQAI_RUNTIME_AUTO_INSTALL ?? "").trim() !== "0";
  const modulesRaw = (env.SQAI_RUNTIME_MODULES ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  const runtimeModules = modulesRaw.length > 0 ? modulesRaw : undefined;
  const buildServiceUrl = (env.SQAI_BUILD_SERVICE_URL ?? "").trim() || DEFAULT_BUILD_SERVICE_URL;
  return { apiKey, deploymentUrl, autoInstall, runtimeModules, buildServiceUrl };
}

export function inferMode(
  explicit: SqaiMode | undefined,
  resolved: ResolvedEnv,
): SqaiMode {
  if (explicit) {
    return explicit;
  }
  if (resolved.deploymentUrl) {
    return "deployment";
  }
  return "local";
}
