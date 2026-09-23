/** Managed-runtime install path: download → verify → extract → spawn.
 *
 * Fully hermetic — no network (downloads are stubbed to copy a locally built
 * tarball) and no real daemon (MojoRuntime is injected). The signed test
 * bundle is REAL: an RSA keypair generated in the test signs a manifest laid
 * out exactly like the upstream builder's (manifest.json + manifest.sig +
 * daemon/ + engine/), tarred with the system tar.
 */

import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { existsSync, promises as fs, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type ManagedRuntimeConfig, RuntimeProvisioner, currentPlatformKey } from "./runtime/provision.js";
import { compareRuntimeVersions, type TrustedKey } from "./runtime/trust.js";
import { daemonEntryFromManifest, isSafeRelativePath } from "./runtime/bundle.js";
import { FIXTURE_CONTRACT } from "./fixtures/contract.js";
import { SqaiError } from "./errors.js";
import type { CapabilityContract } from "./contract.js";
import type { MojoRuntime } from "algenta-sdk";

const BUNDLE_VERSION = "1.2.3";

interface TestKeys {
  privateKeyPem: string;
  trustedKey: TrustedKey;
}

function makeKeys(keyId = "sqai-test-key"): TestKeys {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    privateKeyPem: privateKey,
    trustedKey: { key_id: keyId, algorithm: "RS256", public_key_pem: publicKey },
  };
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

interface BuiltBundle {
  tarball: string;
  tarballSha256: string;
}

interface BuildBundleOptions {
  version?: string;
  platform?: string;
  /** Extra archive members NOT listed in the signed manifest. */
  smuggledFiles?: Record<string, string>;
  /** Create a symlink member (name → target) in the archive. */
  symlink?: { name: string; target: string };
}

/** Build a real signed bundle tarball the way the upstream builder does. */
async function buildSignedBundle(
  workDir: string,
  privateKeyPem: string,
  options: BuildBundleOptions = {},
): Promise<BuiltBundle> {
  const staging = join(workDir, `staging-${Math.random().toString(16).slice(2, 10)}`);
  const files: Record<string, string> = {
    "daemon/testd": "#!/bin/sh\nexit 0\n",
    "daemon/_internal/lib.bin": "internal-lib-bytes\n",
    "engine/simulate": "engine-stub-bytes\n",
  };
  const artifacts: { path: string; sha256: string; size: number }[] = [];
  for (const [relPath, content] of Object.entries(files)) {
    const absolute = join(staging, relPath);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    const data = Buffer.from(content, "utf-8");
    await fs.writeFile(absolute, data);
    artifacts.push({ path: relPath, sha256: sha256(data), size: data.length });
  }
  await fs.chmod(join(staging, "daemon/testd"), 0o755);

  const manifest = {
    bundle_format_version: 1,
    runtime_bundle_version: options.version ?? BUNDLE_VERSION,
    platform: options.platform ?? currentPlatformKey(),
    created_at: "2026-07-24T00:00:00Z",
    engine_stub: true,
    artifacts,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + "\n", "utf-8");
  await fs.writeFile(join(staging, "manifest.json"), manifestBytes);
  await fs.writeFile(join(staging, "manifest.sig"), cryptoSign("sha256", manifestBytes, privateKeyPem));

  const members = ["manifest.json", "manifest.sig", ...Object.keys(files)];
  for (const [relPath, content] of Object.entries(options.smuggledFiles ?? {})) {
    const absolute = join(staging, relPath);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
    members.push(relPath);
  }
  if (options.symlink) {
    await fs.symlink(options.symlink.target, join(staging, options.symlink.name));
    members.push(options.symlink.name);
  }

  const tarball = join(workDir, `bundle-${Math.random().toString(16).slice(2, 10)}.tgz`);
  execFileSync("tar", ["-czf", tarball, "-C", staging, ...members]);
  return { tarball, tarballSha256: sha256(await fs.readFile(tarball)) };
}

function contractWithBundle(sha256Hex: string): CapabilityContract {
  return {
    ...FIXTURE_CONTRACT,
    runtime_bundle: {
      version: BUNDLE_VERSION,
      platforms: {
        [currentPlatformKey()]: { sha256: sha256Hex, url: "https://bundles.test/runtime.tgz" },
      },
    },
  };
}

interface FakeRuntimeHarness {
  factory: (config?: ManagedRuntimeConfig) => MojoRuntime;
  managedConfigs: ManagedRuntimeConfig[];
}

/** Probe runtimes are unreachable; managed (autoStart) runtimes are healthy. */
function fakeRuntimes(managedHealthy = true): FakeRuntimeHarness {
  const managedConfigs: ManagedRuntimeConfig[] = [];
  const factory = (config?: ManagedRuntimeConfig): MojoRuntime => {
    if (config?.autoStart) {
      managedConfigs.push(config);
      return {
        health: async () => ({
          status: managedHealthy ? "ok" : "unreachable",
          engine: "mojo",
          module_count: managedHealthy ? 473 : 0,
          runtime_available: managedHealthy,
        }),
      } as unknown as MojoRuntime;
    }
    return {
      health: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    } as unknown as MojoRuntime;
  };
  return { factory, managedConfigs };
}

interface DownloadStub {
  download: (url: string, destination: string) => Promise<void>;
  calls: string[];
}

function downloadFrom(tarball: string): DownloadStub {
  const calls: string[] = [];
  return {
    calls,
    download: async (url: string, destination: string) => {
      calls.push(url);
      await fs.copyFile(tarball, destination);
    },
  };
}

async function expectProvisionFailure(
  promise: Promise<unknown>,
  reason: string,
): Promise<SqaiError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SqaiError);
  const sqaiError = caught as SqaiError;
  expect(sqaiError.code).toBe("runtime_provision_failed");
  expect(sqaiError.details.reason).toBe(reason);
  return sqaiError;
}

function noTempLeftovers(cacheDir: string): void {
  const leftovers = readdirSync(cacheDir).filter(name => name.startsWith("tmp-"));
  expect(leftovers).toEqual([]);
}

const cleanups: string[] = [];

async function makeDirs(): Promise<{ workDir: string; cacheDir: string }> {
  const workDir = await fs.mkdtemp(join(tmpdir(), "sqai-bundle-"));
  const cacheDir = join(workDir, "cache");
  await fs.mkdir(cacheDir, { recursive: true });
  cleanups.push(workDir);
  return { workDir, cacheDir };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("managed-runtime install path", () => {
  it("happy path: download → verify → extract atomically → spawn via MojoRuntime autoStart", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const runtimes = fakeRuntimes();
    const stub = downloadFrom(bundle.tarball);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: runtimes.factory,
      downloadBundle: stub.download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    const runtime = await provisioner.ensure();
    expect(runtime).toBeTruthy();
    expect(stub.calls).toEqual(["https://bundles.test/runtime.tgz"]);

    // Atomic install landed under <cacheDir>/<version>.
    const installDir = join(cacheDir, BUNDLE_VERSION);
    expect(existsSync(join(installDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(installDir, "daemon", "testd"))).toBe(true);

    // Spawn went through MojoRuntime autoStart with the manifest-derived entry.
    expect(runtimes.managedConfigs).toHaveLength(1);
    expect(runtimes.managedConfigs[0]).toMatchObject({
      autoStart: true,
      daemonCommand: [join(installDir, "daemon", "testd"), "start", "--foreground"],
    });

    // Best-effort state, no lock, no temp leftovers.
    const state = JSON.parse(await fs.readFile(join(cacheDir, "state.json"), "utf-8"));
    expect(state.version).toBe(BUNDLE_VERSION);
    expect(state.started_at).toBeTruthy();
    expect(existsSync(join(cacheDir, `${BUNDLE_VERSION}.lock`))).toBe(false);
    noTempLeftovers(cacheDir);
  });

  it("requires login before spawning the managed daemon", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const saved = {
      ALGENTA_API_KEY: process.env.ALGENTA_API_KEY,
      DE_API_KEY: process.env.DE_API_KEY,
      SQAI_API_KEY: process.env.SQAI_API_KEY,
      SQAI_HOME: process.env.SQAI_HOME,
      ALGENTA_DAEMON_TCP: process.env.ALGENTA_DAEMON_TCP,
    };
    delete process.env.ALGENTA_API_KEY;
    delete process.env.DE_API_KEY;
    delete process.env.SQAI_API_KEY;
    process.env.SQAI_HOME = join(workDir, "sqai-home");
    process.env.ALGENTA_DAEMON_TCP = "127.0.0.1:9";

    try {
      const keys = makeKeys();
      const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
      const stub = downloadFrom(bundle.tarball);
      const provisioner = new RuntimeProvisioner({
        contract: contractWithBundle(bundle.tarballSha256),
        autoInstall: true,
        downloadBundle: stub.download,
        cacheDir,
        trustedKeys: [keys.trustedKey],
      });

      let caught: unknown;
      try {
        await provisioner.ensure();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SqaiError);
      expect((caught as SqaiError).code).toBe("login_required");
      expect((caught as SqaiError).details.reason).toBe("login_key_missing");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("reuses a verified existing install without re-downloading", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const stub = downloadFrom(bundle.tarball);
    const makeProvisioner = () =>
      new RuntimeProvisioner({
        contract: contractWithBundle(bundle.tarballSha256),
        autoInstall: true,
        runtimeFactory: fakeRuntimes().factory,
        downloadBundle: stub.download,
        cacheDir,
        trustedKeys: [keys.trustedKey],
      });

    await makeProvisioner().ensure();
    expect(stub.calls).toHaveLength(1);
    const bytecodeCache = join(
      cacheDir,
      BUNDLE_VERSION,
      "mojo_env",
      ".pixi",
      "envs",
      "default",
      "lib",
      "python3.12",
      "__pycache__",
    );
    await fs.mkdir(bytecodeCache, { recursive: true });
    await fs.writeFile(join(bytecodeCache, "pathlib.cpython-312.pyc"), "generated bytecode");
    await makeProvisioner().ensure(); // fresh provisioner, same cache
    expect(stub.calls).toHaveLength(1);
  });

  it("tampered tarball (pinned sha256 mismatch) → runtime_provision_failed, nothing installed", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle("0".repeat(64)), // pins a different tarball
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    await expectProvisionFailure(provisioner.ensure(), "bundle_sha256_mismatch");
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
    noTempLeftovers(cacheDir);
  });

  it("bad signature (untrusted signing key) → runtime_provision_failed", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const trusted = makeKeys("trusted-key");
    const rogue = makeKeys("rogue-key");
    const bundle = await buildSignedBundle(workDir, rogue.privateKeyPem);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [trusted.trustedKey],
    });

    await expectProvisionFailure(provisioner.ensure(), "manifest_signature_invalid");
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
    noTempLeftovers(cacheDir);
  });

  it("revoked key id → runtime_provision_failed even though the signature verifies", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys("revoked-key");
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
      revokedKeyIds: ["revoked-key"],
    });

    await expectProvisionFailure(provisioner.ensure(), "trusted_key_revoked");
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
  });

  it("version below MIN_ACCEPTED → rollback_protected before any download", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const stub = downloadFrom(bundle.tarball);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: stub.download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
      minAcceptedRuntimeVersion: "2.0.0",
    });

    await expectProvisionFailure(provisioner.ensure(), "rollback_protected");
    expect(stub.calls).toEqual([]);
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
  });

  it("symlink member in the archive → rejected before extraction", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem, {
      symlink: { name: "daemon/evil", target: "/etc/hosts" },
    });
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    await expectProvisionFailure(provisioner.ensure(), "unsafe_member");
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
    noTempLeftovers(cacheDir);
  });

  it("archive member not listed in the signed manifest → rejected", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem, {
      smuggledFiles: { "daemon/_internal/smuggled.so": "not-in-manifest\n" },
    });
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    await expectProvisionFailure(provisioner.ensure(), "unlisted_member");
    expect(existsSync(join(cacheDir, BUNDLE_VERSION))).toBe(false);
  });

  it("daemon never becomes healthy → runtime_provision_failed daemon_unhealthy", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes(false).factory,
      downloadBundle: downloadFrom(bundle.tarball).download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    await expectProvisionFailure(provisioner.ensure(), "daemon_unhealthy");
  });

  it("concurrent installs on a shared cache dir → a single download, both healthy", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const calls: string[] = [];
    const slowDownload = async (url: string, destination: string) => {
      calls.push(url);
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.copyFile(bundle.tarball, destination);
    };
    const makeProvisioner = () =>
      new RuntimeProvisioner({
        contract: contractWithBundle(bundle.tarballSha256),
        autoInstall: true,
        runtimeFactory: fakeRuntimes().factory,
        downloadBundle: slowDownload,
        cacheDir,
        trustedKeys: [keys.trustedKey],
        lockPollIntervalMs: 25,
        lockWaitTimeoutMs: 10_000,
      });

    const [first, second] = await Promise.all([
      makeProvisioner().ensure(),
      makeProvisioner().ensure(),
    ]);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(existsSync(join(cacheDir, BUNDLE_VERSION, "manifest.json"))).toBe(true);
    expect(existsSync(join(cacheDir, `${BUNDLE_VERSION}.lock`))).toBe(false);
    noTempLeftovers(cacheDir);
  });

  it("stale lock (>10 min) is removed and the install proceeds", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const staleCreatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await fs.writeFile(
      join(cacheDir, `${BUNDLE_VERSION}.lock`),
      JSON.stringify({ pid: 99999, created_at: staleCreatedAt }),
      "utf-8",
    );
    const stub = downloadFrom(bundle.tarball);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: stub.download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    await provisioner.ensure();
    expect(stub.calls).toHaveLength(1);
    expect(existsSync(join(cacheDir, BUNDLE_VERSION, "manifest.json"))).toBe(true);
    expect(existsSync(join(cacheDir, `${BUNDLE_VERSION}.lock`))).toBe(false);
  });

  it("fresh lock held by another installer that never finishes → lock_wait_timeout", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    await fs.writeFile(
      join(cacheDir, `${BUNDLE_VERSION}.lock`),
      JSON.stringify({ pid: 99999, created_at: new Date().toISOString() }),
      "utf-8",
    );
    const stub = downloadFrom(bundle.tarball);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: stub.download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
      lockPollIntervalMs: 20,
      lockWaitTimeoutMs: 120,
    });

    const error = await expectProvisionFailure(provisioner.ensure(), "lock_wait_timeout");
    expect(error.retryable).toBe(true);
    expect(stub.calls).toEqual([]);
  });

  it("partially-written fresh lock is waited on, not removed", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const lockPath = join(cacheDir, `${BUNDLE_VERSION}.lock`);
    await fs.writeFile(lockPath, "", "utf-8");
    const stub = downloadFrom(bundle.tarball);
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      runtimeFactory: fakeRuntimes().factory,
      downloadBundle: stub.download,
      cacheDir,
      trustedKeys: [keys.trustedKey],
      lockPollIntervalMs: 20,
      lockWaitTimeoutMs: 120,
    });

    const error = await expectProvisionFailure(provisioner.ensure(), "lock_wait_timeout");
    expect(error.retryable).toBe(true);
    expect(stub.calls).toEqual([]);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("a tampered installed artifact is removed and reinstalled from the pinned tarball", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const stub = downloadFrom(bundle.tarball);
    const makeProvisioner = () =>
      new RuntimeProvisioner({
        contract: contractWithBundle(bundle.tarballSha256),
        autoInstall: true,
        runtimeFactory: fakeRuntimes().factory,
        downloadBundle: stub.download,
        cacheDir,
        trustedKeys: [keys.trustedKey],
      });

    await makeProvisioner().ensure();
    await fs.writeFile(join(cacheDir, BUNDLE_VERSION, "engine", "simulate"), "tampered\n");
    await makeProvisioner().ensure();
    expect(stub.calls).toHaveLength(2); // re-downloaded after removing the bad install
    const restored = await fs.readFile(join(cacheDir, BUNDLE_VERSION, "engine", "simulate"), "utf-8");
    expect(restored).toBe("engine-stub-bytes\n");
  });
});

describe("build-on-provision (runtimeModules filter)", () => {
  it("resolves a filtered bundle, installs under filtered-<cacheKey>, spawns on its own endpoint", async () => {
    const { workDir, cacheDir } = await makeDirs();
    const keys = makeKeys();
    const bundle = await buildSignedBundle(workDir, keys.privateKeyPem);
    const runtimes = fakeRuntimes();
    const stub = downloadFrom(bundle.tarball);
    const resolveCalls: { modules: string[]; platform: string }[] = [];
    const cacheKey = "abc123def4567890abcd";
    const provisioner = new RuntimeProvisioner({
      contract: contractWithBundle(bundle.tarballSha256),
      autoInstall: true,
      // Filter given unsorted/duplicated → normalized to sorted+unique before resolve.
      runtimeModules: ["stats", "bitops", "stats"],
      runtimeFactory: runtimes.factory,
      downloadBundle: stub.download,
      resolveFilteredBundle: async (modules, platform) => {
        resolveCalls.push({ modules, platform });
        return {
          url: "https://build.test/filtered.tgz",
          sha256: bundle.tarballSha256,
          version: BUNDLE_VERSION,
          cacheKey,
        };
      },
      cacheDir,
      trustedKeys: [keys.trustedKey],
    });

    const runtime = await provisioner.ensure();
    expect(runtime).toBeTruthy();

    // The filter reached the build service normalized (sorted, de-duplicated).
    expect(resolveCalls).toEqual([{ modules: ["bitops", "stats"], platform: currentPlatformKey() }]);
    // Downloaded from the build-service URL, not the contract pin.
    expect(stub.calls).toEqual(["https://build.test/filtered.tgz"]);

    // Installed under a filter-namespaced dir — never colliding with the default.
    const installDir = join(cacheDir, `filtered-${cacheKey}`);
    expect(existsSync(join(installDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(cacheDir, BUNDLE_VERSION, "manifest.json"))).toBe(false);

    // Spawned with autoStart on a deterministic per-filter port (50100 + hash%800).
    const seed = parseInt(cacheKey.slice(0, 6), 16);
    const expectedTcp = `127.0.0.1:${50100 + (seed % 800)}`;
    expect(runtimes.managedConfigs).toHaveLength(1);
    expect(runtimes.managedConfigs[0]).toMatchObject({
      autoStart: true,
      tcpAddress: expectedTcp,
      daemonCommand: [join(installDir, "daemon", "testd"), "start", "--foreground"],
    });
    // Endpoint env restored after the spawn (no leakage into the parent process).
    expect(process.env.ALGENTA_DAEMON_TCP).toBeUndefined();
  });

  it("runtimeModules with no build service configured → runtime_provision_failed", async () => {
    const { cacheDir } = await makeDirs();
    const provisioner = new RuntimeProvisioner({
      contract: FIXTURE_CONTRACT,
      autoInstall: true,
      runtimeModules: ["stats"],
      runtimeFactory: fakeRuntimes().factory,
      cacheDir,
    });
    let caught: unknown;
    try {
      await provisioner.ensure();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqaiError);
    expect((caught as SqaiError).details.reason).toBe("no_build_service");
  });
});

describe("trust root primitives", () => {
  it("compareRuntimeVersions orders numerically with prerelease below release", () => {
    expect(compareRuntimeVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareRuntimeVersions("1.2.3", "1.10.0")).toBeLessThan(0);
    expect(compareRuntimeVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareRuntimeVersions("2.0.0-rc.1", "2.0.0")).toBeLessThan(0);
    expect(compareRuntimeVersions("0.1.0-dev", "0.0.0")).toBeGreaterThan(0);
    expect(compareRuntimeVersions("1.2", "1.2.0")).toBe(0);
  });

  it("isSafeRelativePath rejects traversal, absolutes, and control characters", () => {
    expect(isSafeRelativePath("daemon/testd")).toBe(true);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a/../b")).toBe(false);
    expect(isSafeRelativePath("a//b")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("a\\b")).toBe(false);
    expect(isSafeRelativePath("a\nb")).toBe(false);
    expect(isSafeRelativePath("./a")).toBe(false);
  });

  it("daemonEntryFromManifest derives the single depth-2 daemon/ artifact", () => {
    const manifest = {
      bundle_format_version: 1,
      runtime_bundle_version: "1.2.3",
      platform: "test",
      created_at: "2026-07-24T00:00:00Z",
      engine_stub: true,
      artifacts: [
        { path: "daemon/algenta-runtime-daemon", sha256: "0".repeat(64), size: 1 },
        { path: "daemon/_internal/base_library.zip", sha256: "0".repeat(64), size: 1 },
        { path: "engine/simulate", sha256: "0".repeat(64), size: 1 },
      ],
    };
    expect(daemonEntryFromManifest(manifest)).toBe("daemon/algenta-runtime-daemon");
  });
});
