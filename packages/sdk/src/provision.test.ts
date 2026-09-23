import { describe, expect, it, vi } from "vitest";

import { RuntimeProvisioner, currentPlatformKey, runtimeCacheDir } from "./runtime/provision.js";
import { FIXTURE_CONTRACT } from "./fixtures/contract.js";
import type { MojoRuntime } from "algenta-sdk";

function healthyRuntime(): MojoRuntime {
  return {
    health: vi.fn(async () => ({
      status: "ok",
      engine: "mojo",
      module_count: 473,
      runtime_available: true,
    })),
  } as unknown as MojoRuntime;
}

function unreachableRuntime(): MojoRuntime {
  return {
    health: vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }),
  } as unknown as MojoRuntime;
}

describe("runtime provisioning", () => {
  it("reuses an already-healthy daemon", async () => {
    const runtime = healthyRuntime();
    const provisioner = new RuntimeProvisioner({
      contract: FIXTURE_CONTRACT,
      autoInstall: true,
      runtimeFactory: () => runtime,
    });
    await expect(provisioner.ensure()).resolves.toBe(runtime);
    const status = await provisioner.status();
    expect(status.runtime_available).toBe(true);
    expect(status.managed).toBe(true);
  });

  it("no bundle published for any platform → structured unsupported_platform", async () => {
    const provisioner = new RuntimeProvisioner({
      contract: FIXTURE_CONTRACT,
      autoInstall: true,
      runtimeFactory: unreachableRuntime,
    });
    await expect(provisioner.ensure()).rejects.toMatchObject({
      code: "unsupported_platform",
      retryable: false,
    });
  });

  it("auto-install disabled → runtime_provision_failed with remediation", async () => {
    const contract = {
      ...FIXTURE_CONTRACT,
      runtime_bundle: {
        version: "2026.07.0",
        platforms: { [currentPlatformKey()]: { sha256: "abc", url: "https://example.com/b.tgz" } },
      },
    };
    const provisioner = new RuntimeProvisioner({
      contract,
      autoInstall: false,
      runtimeFactory: unreachableRuntime,
    });
    await expect(provisioner.ensure()).rejects.toMatchObject({ code: "runtime_provision_failed" });
    await expect(provisioner.ensure()).rejects.toThrowError(/sqai runtime install/);
  });

  it("concurrent ensure() calls share one attempt", async () => {
    let calls = 0;
    const runtime = {
      health: vi.fn(async () => {
        calls += 1;
        return { status: "ok", engine: "mojo", module_count: 1, runtime_available: true };
      }),
    } as unknown as MojoRuntime;
    const provisioner = new RuntimeProvisioner({
      contract: FIXTURE_CONTRACT,
      autoInstall: true,
      runtimeFactory: () => runtime,
    });
    await Promise.all([provisioner.ensure(), provisioner.ensure(), provisioner.ensure()]);
    expect(calls).toBe(1);
  });

  it("cache dir is an OS-appropriate user cache location, not a dot-dir", () => {
    const dir = runtimeCacheDir();
    expect(dir).not.toContain("/.algenta/");
    expect(dir.toLowerCase()).toContain(process.platform === "darwin" ? "caches" : "cache");
  });
});
