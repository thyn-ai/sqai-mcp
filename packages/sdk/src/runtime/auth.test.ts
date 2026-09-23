/** Tests for the exported device-login gate (runtime/auth.ts).
 *
 * ensureLocalLoginKey is the one check every local execution surface runs —
 * the managed-runtime provisioner before spawning the daemon, and the MCP
 * server before every tools/call. It must:
 *   - pass on an explicit env key (current or legacy), untouched;
 *   - promote the `sqai login` cached key into ALGENTA_API_KEY;
 *   - otherwise throw the structured login_required SqaiError.
 * All paths are offline; SQAI_HOME is isolated per test. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqaiError } from "../errors.js";
import { ensureLocalLoginKey } from "./auth.js";

const ENV_KEYS = ["SQAI_API_KEY", "ALGENTA_API_KEY", "DE_API_KEY", "SQAI_HOME"] as const;

describe("ensureLocalLoginKey", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("passes on an explicit SQAI_API_KEY and promotes it for the daemon", async () => {
    process.env.SQAI_API_KEY = "explicit-key";
    process.env.SQAI_HOME = mkdtempSync(join(tmpdir(), "sqai-auth-test-"));
    await expect(ensureLocalLoginKey()).resolves.toBeUndefined();
    // The runtime daemon reads ALGENTA_API_KEY / DE_API_KEY, so a resolved key
    // is always promoted into ALGENTA_API_KEY (pre-existing behavior).
    expect(process.env.ALGENTA_API_KEY).toBe("explicit-key");
  });

  it("passes on the legacy DE_API_KEY env key", async () => {
    process.env.DE_API_KEY = "legacy-key";
    process.env.SQAI_HOME = mkdtempSync(join(tmpdir(), "sqai-auth-test-"));
    await expect(ensureLocalLoginKey()).resolves.toBeUndefined();
  });

  it("promotes the cached `sqai login` key into ALGENTA_API_KEY", async () => {
    const home = mkdtempSync(join(tmpdir(), "sqai-auth-test-"));
    writeFileSync(join(home, "api_key"), "cached-device-key\n", "utf8");
    process.env.SQAI_HOME = home;
    await expect(ensureLocalLoginKey()).resolves.toBeUndefined();
    expect(process.env.ALGENTA_API_KEY).toBe("cached-device-key");
  });

  it("throws the structured login_required with no key anywhere", async () => {
    process.env.SQAI_HOME = mkdtempSync(join(tmpdir(), "sqai-auth-test-"));
    let caught: unknown;
    try {
      await ensureLocalLoginKey();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqaiError);
    const error = caught as SqaiError;
    expect(error.code).toBe("login_required");
    expect(error.message).toBe(
      "Local compute requires a free SQAI device login. Run `sqai login` once, " +
        "or set SQAI_API_KEY in this process.",
    );
    expect(error.retryable).toBe(false);
    expect(error.details.reason).toBe("login_key_missing");
    expect(error.toResult()).toEqual({
      status: "error",
      code: "login_required",
      message:
        "Local compute requires a free SQAI device login. Run `sqai login` once, " +
        "or set SQAI_API_KEY in this process.",
      retryable: false,
      request_id: null,
    });
  });
});
