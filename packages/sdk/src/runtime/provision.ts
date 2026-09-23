/** Managed-runtime provisioning: zero-setup for the computation plane.
 *
 * The query plane never touches this module. On first computation-plane call:
 *   1. Reuse a healthy daemon whose version matches the contract pin.
 *   2. Otherwise verify + spawn the installed bundle for this platform.
 *   3. Otherwise download the contract-pinned bundle (tarball sha256 + RS256
 *      manifest against the embedded trust root — see runtime/trust.ts and
 *      runtime/bundle.ts), extract atomically, spawn.
 *
 * Concurrency hardening: a per-version lock file (`<cacheDir>/<version>.lock`
 * with `{pid, created_at}`) serializes installers across processes — fresh
 * locks are poll-waited (max 90s) while re-checking for a completed install,
 * stale locks (>10 min) are removed. Downloads land in `tmp-<random>` names,
 * verification happens BEFORE extraction, extraction lands in a `tmp-<random>`
 * directory that is atomically renamed into place, and every failure cleans
 * its temp state — a partial install is never left behind.
 */

import { homedir, platform as osPlatform, arch as osArch } from "node:os";
import { join } from "node:path";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MojoRuntime, type MojoRuntimeConfig } from "algenta-sdk";
import { ensureLocalLoginKey as ensureSharedLocalLoginKey } from "./auth.js";

import { SqaiError } from "../errors.js";
import type { CapabilityContract } from "../contract.js";
import type { LocalComputeRuntime } from "../compute/dispatch.js";
import {
  BundleVerificationError,
  daemonEntryFromManifest,
  digestsEqual,
  sha256File,
  verifyBundleTarball,
  verifyInstalledBundleDir,
  extractTarball,
  MANIFEST_NAME,
  type BundleManifest,
  type ManifestExpectations,
} from "./bundle.js";
import {
  compareRuntimeVersions,
  defaultTrustRoot,
  type TrustRoot,
  type TrustedKey,
} from "./trust.js";

export interface RuntimeStatus {
  available: boolean;
  runtime_available: boolean;
  engine: string | null;
  module_count: number;
  platform: string;
  managed: boolean;
}

export interface ManagedRuntimeConfig {
  mode?: "local";
  tcpAddress?: string;
  timeout?: number;
  autoStart?: boolean;
  daemonCommand?: string[];
}

export interface ManagedRuntime extends LocalComputeRuntime {
  health(): Promise<{
    runtime_available: boolean;
    engine: string;
    module_count: number;
  }>;
}

/** Lock file freshness / wait policy (test-overridable via options). */
export const LOCK_FRESH_MS = 10 * 60 * 1000; // a fresh lock means an installer is live
export const LOCK_WAIT_TIMEOUT_MS = 90 * 1000; // how long to wait on a fresh lock
export const LOCK_POLL_INTERVAL_MS = 1000;

/** A runtime bundle resolved for a specific module filter (build-on-provision). */
export interface FilteredBundle {
  url: string;
  sha256: string;
  version: string;
  cacheKey: string;
}

export interface ProvisionerOptions {
  contract: CapabilityContract;
  autoInstall: boolean;
  /**
   * Build-on-provision: the developer's module filter. All 4,762 functions are
   * available in the contract; only the selected modules are compiled + installed.
   * Empty/undefined → the default pinned bundle (contract.runtime_bundle).
   */
  runtimeModules?: string[];
  /** Build service that compiles a bundle for an exact filter (POST /v1/runtime/build). */
  buildServiceUrl?: string;
  /** Injection points for tests. */
  runtimeFactory?: (config?: ManagedRuntimeConfig) => ManagedRuntime;
  downloadBundle?: (url: string, destination: string) => Promise<void>;
  /** Resolve a filtered bundle (default: POST to buildServiceUrl). Test injection. */
  resolveFilteredBundle?: (modules: string[], platformKey: string) => Promise<FilteredBundle>;
  /** Bundle cache directory (default: OS user cache — runtimeCacheDir()). */
  cacheDir?: string;
  /** Trust-root overrides (default: the embedded trust root). */
  trustedKeys?: TrustedKey[];
  revokedKeyIds?: string[];
  minAcceptedRuntimeVersion?: string;
  /** Lock policy overrides. */
  lockFreshMs?: number;
  lockWaitTimeoutMs?: number;
  lockPollIntervalMs?: number;
}

export function currentPlatformKey(): string {
  const os = osPlatform();
  const arch = osArch();
  const osName = os === "darwin" ? "darwin" : os === "linux" ? "linux" : os;
  return `${osName}-${arch}`;
}

function cacheDirFor(brand: string): string {
  const os = osPlatform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Caches", brand, "runtime");
  }
  if (os === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(localAppData, brand, "runtime");
  }
  const xdgCache = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(xdgCache, brand.toLowerCase(), "runtime");
}

export function runtimeCacheDir(): string {
  const current = cacheDirFor("SQAI");
  // Reuse a pre-rename install (legacy substrate cache) if it exists and the new
  // location doesn't — avoids a needless re-download after the white-label rename.
  if (!existsSync(current)) {
    const legacy = cacheDirFor("Algenta");
    if (legacy !== current && existsSync(legacy)) {
      return legacy;
    }
  }
  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveBundleUrl(url: string, version: string, platformKey: string): string {
  return url.replaceAll("{version}", version).replaceAll("{platform}", platformKey);
}

async function defaultDownloadBundle(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`bundle download failed: HTTP ${response.status}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as import("stream/web").ReadableStream),
    createWriteStream(destination),
  );
}

async function removeQuietly(path: string): Promise<void> {
  try {
    await fs.rm(path, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

interface InstalledBundle {
  installDir: string;
  manifest: BundleManifest;
}

export class RuntimeProvisioner {
  private readonly options: ProvisionerOptions;
  private readonly trustRoot: TrustRoot;
  private runtime: ManagedRuntime | null = null;
  private ensurePromise: Promise<ManagedRuntime> | null = null;

  constructor(options: ProvisionerOptions) {
    this.options = options;
    const base = defaultTrustRoot();
    this.trustRoot = {
      trustedKeys: options.trustedKeys ?? base.trustedKeys,
      revokedKeyIds: options.revokedKeyIds ?? base.revokedKeyIds,
      minAcceptedRuntimeVersion: options.minAcceptedRuntimeVersion ?? base.minAcceptedRuntimeVersion,
    };
  }

  /** Lazily resolve a usable runtime; concurrent callers share one attempt. */
  ensure(): Promise<ManagedRuntime> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.doEnsure().catch(error => {
        this.ensurePromise = null;
        throw error;
      });
    }
    return this.ensurePromise;
  }

  async status(): Promise<RuntimeStatus> {
    const runtime = this.newRuntime();
    try {
      const health = await runtime.health();
      return {
        available: true,
        runtime_available: health.runtime_available,
        engine: health.engine,
        module_count: health.module_count,
        platform: currentPlatformKey(),
        managed: this.runtime !== null,
      };
    } catch {
      return {
        available: false,
        runtime_available: false,
        engine: null,
        module_count: 0,
        platform: currentPlatformKey(),
        managed: false,
      };
    }
  }

  async stop(): Promise<void> {
    // v1 policy is leave-running; stop only applies to a daemon we spawned.
    // Spawn management lands with the bundle pipeline.
    this.runtime = null;
    this.ensurePromise = null;
  }

  private newRuntime(config?: ManagedRuntimeConfig): ManagedRuntime {
    if (this.options.runtimeFactory) {
      return this.options.runtimeFactory(config);
    }
    return new MojoRuntime((config ?? {}) as MojoRuntimeConfig);
  }

  private async ensureLocalLoginKey(): Promise<void> {
    // A BYO runtime (tests / custom deployments) authenticates itself; every
    // other local path goes through the one shared device-login gate.
    if (this.options.runtimeFactory) {
      return;
    }
    await ensureSharedLocalLoginKey();
  }

  private cacheDir(): string {
    return this.options.cacheDir ?? runtimeCacheDir();
  }

  /** Normalized module filter (sorted, unique, non-empty) or null for the default bundle. */
  private filterModules(): string[] | null {
    const mods = (this.options.runtimeModules ?? [])
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (mods.length === 0) {
      return null;
    }
    return Array.from(new Set(mods)).sort();
  }

  /** Ask the build service to compile + sign a bundle for exactly these modules. */
  private async resolveFilteredBundle(
    modules: string[],
    platformKey: string,
  ): Promise<FilteredBundle> {
    if (this.options.resolveFilteredBundle) {
      return this.options.resolveFilteredBundle(modules, platformKey);
    }
    const base = this.options.buildServiceUrl;
    if (!base) {
      throw new SqaiError(
        "runtime_provision_failed",
        "runtimeModules was set but no build service is configured. Set SQAI_BUILD_SERVICE_URL " +
          "to a build-on-provision endpoint, or omit runtimeModules to use the default bundle.",
        { details: { reason: "no_build_service", modules } },
      );
    }
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, "")}/v1/runtime/build`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modules, platform: platformKey }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SqaiError(
        "runtime_provision_failed",
        `Build service request failed: ${message}`,
        { retryable: true, details: { reason: "build_service_unreachable", modules } },
      );
    }
    if (!response.ok) {
      throw new SqaiError(
        "runtime_provision_failed",
        `Build service returned HTTP ${response.status} for the requested filter.`,
        { retryable: response.status >= 500, details: { reason: "build_failed", modules } },
      );
    }
    const body = (await response.json()) as {
      url: string;
      sha256: string;
      version?: string;
      cache_key: string;
    };
    return {
      url: body.url,
      sha256: body.sha256,
      version: body.version ?? this.options.contract.runtime_bundle.version,
      cacheKey: body.cache_key,
    };
  }

  /**
   * The filter's cache key, computed IDENTICALLY to the build service
   * (sha256("mods|platform|version")[:20], mods = sorted+unique, comma-joined).
   * Lets the reuse fast-path find an already-running filtered daemon without a
   * build-service round-trip. The build service's returned key is authoritative
   * for install; this only has to match for the reuse optimization to hit.
   */
  private localCacheKey(modules: string[], platformKey: string): string {
    const canonical = modules.join(",");
    const version = this.options.contract.runtime_bundle.version;
    return createHash("sha256")
      .update(`${canonical}|${platformKey}|${version}`)
      .digest("hex")
      .slice(0, 20);
  }

  /**
   * Deterministic per-filter daemon endpoint so a filtered runtime never collides
   * with the default (or another filter's) daemon on the shared default socket.
   */
  private filterEndpoint(cacheKey: string): { sock: string; tcp: string } {
    const seed = parseInt(cacheKey.slice(0, 6), 16) || 0;
    const port = 50100 + (seed % 800);
    return { sock: join(this.cacheDir(), `${cacheKey}.sock`), tcp: `127.0.0.1:${port}` };
  }

  private static readonly DAEMON_ENDPOINT_ENV = [
    "ALGENTA_DAEMON_SOCK",
    "ALGENTA_DAEMON_TCP",
    "ALGENTA_MOJO_SOCK",
    "ALGENTA_RUNTIME_DIR",
  ] as const;

  /** Point the about-to-be-spawned daemon at a filter-specific socket/port/dir. */
  private applyDaemonEndpointEnv(
    endpoint: { sock: string; tcp: string },
    installDir: string,
  ): Record<string, string | undefined> {
    const saved: Record<string, string | undefined> = {};
    for (const key of RuntimeProvisioner.DAEMON_ENDPOINT_ENV) {
      saved[key] = process.env[key];
    }
    process.env.ALGENTA_DAEMON_SOCK = endpoint.sock;
    process.env.ALGENTA_DAEMON_TCP = endpoint.tcp;
    process.env.ALGENTA_MOJO_SOCK = `${endpoint.sock}.worker`;
    process.env.ALGENTA_RUNTIME_DIR = join(installDir, ".runtime");
    return saved;
  }

  private restoreEnv(saved: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  private async doEnsure(): Promise<ManagedRuntime> {
    const platformKey = currentPlatformKey();
    const filter = this.filterModules();

    await this.ensureLocalLoginKey();

    // 1. Reuse an already-running healthy daemon on this target's endpoint. For a
    // filtered runtime the endpoint is derived from a locally-computed cache key
    // (identical to the build service's), so a warm daemon is reused WITHOUT a
    // build-service round-trip.
    const probeEndpoint = filter
      ? this.filterEndpoint(this.localCacheKey(filter, platformKey))
      : undefined;
    const runtime = this.newRuntime(probeEndpoint ? { tcpAddress: probeEndpoint.tcp } : undefined);
    try {
      const health = await runtime.health();
      if (health.runtime_available) {
        this.runtime = runtime;
        return runtime;
      }
    } catch {
      // fall through to provisioning
    }

    // 2./3. Resolve the install target: the default pinned bundle, or — when a
    // module filter is set — a build-on-provision bundle compiled for that filter.
    let version: string;
    let installKey: string;
    let platformBundle: { sha256: string; url: string };
    let endpoint: { sock: string; tcp: string } | undefined;
    if (filter) {
      const resolved = await this.resolveFilteredBundle(filter, platformKey);
      version = resolved.version;
      installKey = `filtered-${resolved.cacheKey}`;
      platformBundle = { url: resolved.url, sha256: resolved.sha256 };
      endpoint = this.filterEndpoint(resolved.cacheKey);
    } else {
      const bundle = this.options.contract.runtime_bundle;
      const pinned = bundle.platforms[platformKey];
      if (!pinned) {
        const supported = Object.keys(bundle.platforms);
        throw new SqaiError(
          "unsupported_platform",
          supported.length === 0
            ? "No managed runtime bundle is published yet for any platform. " +
              "Run `sqai login`, or set SQAI_DEPLOYMENT_URL / SQAI_API_KEY " +
              "for a managed SQAI deployment."
            : `No managed runtime bundle is published for '${platformKey}'.`,
          { details: { platform: platformKey, supported } },
        );
      }
      version = bundle.version;
      installKey = version;
      platformBundle = pinned;
    }

    // Provision the bundle for this platform.
    if (!this.options.autoInstall) {
      throw new SqaiError(
        "runtime_provision_failed",
        "Automatic runtime installation is disabled (SQAI_RUNTIME_AUTO_INSTALL=0). " +
          "Install manually with `sqai runtime install` or `sqai runtime install --from-file`.",
        { details: { platform: platformKey, version } },
      );
    }

    // Rollback protection applies to the contract pin as well as the manifest.
    if (compareRuntimeVersions(version, this.trustRoot.minAcceptedRuntimeVersion) < 0) {
      throw new SqaiError(
        "runtime_provision_failed",
        `Managed runtime ${version} is below the minimum accepted runtime version ` +
          `${this.trustRoot.minAcceptedRuntimeVersion} (rollback protection).`,
        {
          details: {
            reason: "rollback_protected",
            platform: platformKey,
            version,
            min_accepted_version: this.trustRoot.minAcceptedRuntimeVersion,
          },
        },
      );
    }

    const installed = await this.ensureInstalled(platformKey, version, platformBundle, installKey);
    return this.spawnInstalled(platformKey, installed, endpoint);
  }

  private provisionError(
    reason: string,
    message: string,
    platformKey: string,
    version: string,
    extra: Record<string, unknown> = {},
    retryable = false,
  ): SqaiError {
    return new SqaiError("runtime_provision_failed", message, {
      retryable,
      details: {
        reason,
        platform: platformKey,
        version,
        cache_dir: this.cacheDir(),
        ...extra,
      },
    });
  }

  private wrapVerificationError(
    error: unknown,
    platformKey: string,
    version: string,
  ): SqaiError {
    if (error instanceof SqaiError) {
      return error;
    }
    if (error instanceof BundleVerificationError) {
      return this.provisionError(
        error.reason,
        `Managed runtime ${version} for '${platformKey}' failed verification: ${error.message}`,
        platformKey,
        version,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return this.provisionError(
      "install_failed",
      `Managed runtime ${version} for '${platformKey}' could not be provisioned: ${message}`,
      platformKey,
      version,
    );
  }

  private manifestExpectations(platformKey: string, version: string): ManifestExpectations {
    return {
      trustRoot: this.trustRoot,
      expectedVersion: version,
      expectedPlatform: platformKey,
    };
  }

  /** Verify an existing install if present; returns null when absent/invalid. */
  private async verifiedInstallOrNull(
    platformKey: string,
    version: string,
    removeOnFailure: boolean,
    installKey: string = version,
  ): Promise<InstalledBundle | null> {
    const installDir = join(this.cacheDir(), installKey);
    try {
      await fs.access(join(installDir, MANIFEST_NAME));
    } catch {
      return null;
    }
    try {
      const manifest = await verifyInstalledBundleDir(
        installDir,
        this.manifestExpectations(platformKey, version),
      );
      return { installDir, manifest };
    } catch {
      // A corrupt / tampered install never survives: remove it and let the
      // download path reinstall from the pinned tarball (which re-raises any
      // signature/rollback failure with its precise reason).
      if (removeOnFailure) {
        await removeQuietly(installDir);
      }
      return null;
    }
  }

  private async acquireLock(lockPath: string): Promise<boolean> {
    const payload = JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() });
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(payload, "utf-8");
      } finally {
        await handle.close();
      }
      return true;
    } catch {
      return false;
    }
  }

  private async lockIsStale(lockPath: string): Promise<boolean> {
    const freshMs = this.options.lockFreshMs ?? LOCK_FRESH_MS;
    const ageFromMtime = async (): Promise<number | null> => {
      try {
        const stat = await fs.stat(lockPath);
        return Date.now() - stat.mtimeMs;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code === "ENOENT" ? null : Number.POSITIVE_INFINITY;
      }
    };
    try {
      const raw = await fs.readFile(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as { created_at?: unknown };
      const createdAt = typeof parsed.created_at === "string" ? Date.parse(parsed.created_at) : NaN;
      if (!Number.isFinite(createdAt)) {
        const age = await ageFromMtime();
        return age !== null && age >= freshMs;
      }
      return Date.now() - createdAt >= freshMs;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false; // lock vanished — not stale, just gone; caller retries acquire
      }
      const age = await ageFromMtime();
      return age !== null && age >= freshMs;
    }
  }

  /** Serialize installers on `<cacheDir>/<installKey>.lock`; returns the verified install. */
  private async ensureInstalled(
    platformKey: string,
    version: string,
    platformBundle: { sha256: string; url: string },
    installKey: string = version,
  ): Promise<InstalledBundle> {
    const cacheDir = this.cacheDir();
    await fs.mkdir(cacheDir, { recursive: true });

    // Fast path: an existing verified install needs no lock.
    const existing = await this.verifiedInstallOrNull(platformKey, version, true, installKey);
    if (existing) {
      return existing;
    }

    const lockPath = join(cacheDir, `${installKey}.lock`);
    const waitTimeoutMs = this.options.lockWaitTimeoutMs ?? LOCK_WAIT_TIMEOUT_MS;
    const pollIntervalMs = this.options.lockPollIntervalMs ?? LOCK_POLL_INTERVAL_MS;
    const deadline = Date.now() + waitTimeoutMs;

    for (;;) {
      if (await this.acquireLock(lockPath)) {
        break;
      }
      if (await this.lockIsStale(lockPath)) {
        await removeQuietly(lockPath);
        continue;
      }
      // A fresh lock: another installer is live — wait for it, re-checking
      // whether it finished the install for us.
      const finished = await this.verifiedInstallOrNull(platformKey, version, false, installKey);
      if (finished) {
        return finished;
      }
      if (Date.now() >= deadline) {
        const lastChance = await this.verifiedInstallOrNull(platformKey, version, false, installKey);
        if (lastChance) {
          return lastChance;
        }
        throw this.provisionError(
          "lock_wait_timeout",
          `Another installer holds the runtime install lock for ${version} and did not ` +
            `finish within ${Math.round(waitTimeoutMs / 1000)}s. Retry, or remove the stale ` +
            "lock from the runtime cache directory.",
          platformKey,
          version,
          { lock_file: `${installKey}.lock` },
          true,
        );
      }
      await sleep(pollIntervalMs);
    }

    try {
      // Double-check under the lock: a racing installer may have finished
      // between our fast path and lock acquisition.
      const raced = await this.verifiedInstallOrNull(platformKey, version, false, installKey);
      if (raced) {
        return raced;
      }
      return await this.downloadVerifyExtract(platformKey, version, platformBundle, installKey);
    } finally {
      await removeQuietly(lockPath);
    }
  }

  /** Holder-of-the-lock path: download → verify → extract → atomic rename. */
  private async downloadVerifyExtract(
    platformKey: string,
    version: string,
    platformBundle: { sha256: string; url: string },
    installKey: string = version,
  ): Promise<InstalledBundle> {
    const cacheDir = this.cacheDir();
    const token = randomBytes(6).toString("hex");
    const tarballPath = join(cacheDir, `tmp-${token}.tgz`);
    const extractDir = join(cacheDir, `tmp-${token}`);
    const installDir = join(cacheDir, installKey);
    const url = resolveBundleUrl(platformBundle.url, version, platformKey);

    try {
      // Download to a temp name.
      const download = this.options.downloadBundle ?? defaultDownloadBundle;
      try {
        await download(url, tarballPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw this.provisionError(
          "download_failed",
          `Managed runtime ${version} for '${platformKey}' could not be downloaded: ${message}`,
          platformKey,
          version,
          { url },
          true,
        );
      }

      // The tarball must match the contract's pinned sha256 exactly.
      const actualSha = await sha256File(tarballPath);
      if (!digestsEqual(actualSha, platformBundle.sha256)) {
        throw this.provisionError(
          "bundle_sha256_mismatch",
          `Managed runtime ${version} for '${platformKey}' failed the download integrity ` +
            `check: expected sha256 ${platformBundle.sha256.slice(0, 12)}…, ` +
            `got ${actualSha.slice(0, 12)}….`,
          platformKey,
          version,
        );
      }

      // Full signed-bundle verification BEFORE anything is extracted.
      let manifest: BundleManifest;
      try {
        manifest = await verifyBundleTarball(
          tarballPath,
          this.manifestExpectations(platformKey, version),
        );
      } catch (error) {
        throw this.wrapVerificationError(error, platformKey, version);
      }

      // Extract into a temp directory, re-check what landed, then rename
      // atomically into place.
      try {
        await extractTarball(tarballPath, extractDir);
        await verifyInstalledBundleDir(
          extractDir,
          this.manifestExpectations(platformKey, version),
        );
      } catch (error) {
        throw this.wrapVerificationError(error, platformKey, version);
      }

      try {
        await fs.rename(extractDir, installDir);
      } catch (error) {
        // A racing installer may have won the rename despite the lock (e.g.
        // stale-lock recovery). If a verified install exists, use it.
        const raced = await this.verifiedInstallOrNull(platformKey, version, false, installKey);
        if (raced) {
          return raced;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw this.provisionError(
          "install_rename_failed",
          `Managed runtime ${version} for '${platformKey}' could not be moved into place: ${message}`,
          platformKey,
          version,
        );
      }
      return { installDir, manifest };
    } finally {
      await removeQuietly(tarballPath);
      await removeQuietly(extractDir);
    }
  }

  /** Spawn the installed bundle's daemon through managed runtime auto-start. */
  private async spawnInstalled(
    platformKey: string,
    installed: InstalledBundle,
    endpoint?: { sock: string; tcp: string },
  ): Promise<ManagedRuntime> {
    const version = installed.manifest.runtime_bundle_version;
    let entryRelative: string;
    try {
      entryRelative = daemonEntryFromManifest(installed.manifest);
    } catch (error) {
      throw this.wrapVerificationError(error, platformKey, version);
    }
    const daemonCommand = [
      join(installed.installDir, ...entryRelative.split("/")),
      "start",
      "--foreground",
    ];
    // Hand the daemon the device-login API key so it can exchange it once for a device-bound
    // offline license (the runtime reads ALGENTA_API_KEY / DE_API_KEY). The daemon inherits
    // process.env, so set it from the key `sqai login` cached under ~/.sqai — without clobbering
    // an explicit env key.
    await this.ensureLocalLoginKey();
    // A filtered runtime gets its own daemon socket/port/dir so it never collides
    // with the default (or another filter's) daemon. The daemon reads these from
    // its environment; managed runtime auto-start spawns it inheriting process.env, so
    // we set them around the spawn and restore afterward (ensure() is serialized).
    const managed = this.newRuntime(
      endpoint ? { autoStart: true, daemonCommand, tcpAddress: endpoint.tcp } : { autoStart: true, daemonCommand },
    );
    const savedEnv = endpoint ? this.applyDaemonEndpointEnv(endpoint, installed.installDir) : null;
    try {
      const health = await managed.health();
      if (!health.runtime_available) {
        throw this.provisionError(
          "daemon_unhealthy",
          `Managed runtime ${version} was installed but its daemon did not report a usable ` +
            "runtime. Check the daemon logs and retry.",
          platformKey,
          version,
          { daemon_entry: entryRelative },
        );
      }
    } catch (error) {
      if (error instanceof SqaiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw this.provisionError(
        "daemon_unhealthy",
        `Managed runtime ${version} was installed but its daemon did not become healthy: ` +
          message,
        platformKey,
        version,
        { daemon_entry: entryRelative },
      );
    } finally {
      if (savedEnv) {
        this.restoreEnv(savedEnv);
      }
    }

    // Best-effort provisioning state (the daemon is detached; pid unknown here).
    try {
      await fs.writeFile(
        join(this.cacheDir(), "state.json"),
        JSON.stringify(
          { pid: null, version, started_at: new Date().toISOString() },
          null,
          2,
        ) + "\n",
        "utf-8",
      );
    } catch {
      // never fail provisioning over telemetry state
    }

    this.runtime = managed;
    return managed;
  }
}
