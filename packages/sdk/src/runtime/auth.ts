/**
 * `sqai login` — device onboarding for the SQAI runtime (JS/TS side; mirrors the Python sqai._login).
 *
 * Authenticates via the shared accounts portal (OAuth 2.0 device grant, RFC 8628), resolves-or-creates
 * the caller's org on the free `sqai_developer` tier, and mints a control-plane API key. The key is
 * cached under ~/.sqai and handed to the local runtime daemon, which exchanges it
 * once for a platform-signed, device-bound offline license — then everything runs locally, no query-time
 * network.
 *
 * Free forever on 1 machine. Paid tiers (sqai_pro / sqai_team) add devices/seats/commercial use via the
 * accounts billing portal — never a cloud service. Login is licensing-only; no data leaves the machine.
 */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, rmSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

import { SqaiError } from "../errors.js";

// Product identity for the shared device flow.
const CLIENT_ID = "sqai-cli";
const SCOPE = "sqai";
const PRODUCT = "sqai";
const DEFAULT_PLAN = "sqai_developer"; // free, 1 device, non-commercial

// Control-plane hosts (overridable so the flow is testable against a mock / pre-cutover host).
const DEFAULT_ACCOUNTS_URL = "https://accounts.thyn.ai"; // shared identity portal
const DEFAULT_API_URL = "https://api.sqai.com"; // shared control plane (sqai.com is the brand domain, not .ai)

export class LoginError extends Error {}

// ── on-disk state (~/.sqai; each secret 0600) ───────────────────────────────────────────────

export function sqaiHome(): string {
  return process.env.SQAI_HOME ?? join(homedir(), ".sqai");
}
const p = (name: string) => join(sqaiHome(), name);
const apiKeyPath = () => p("api_key");
const tokenPath = () => p("token");
const deviceKeyPath = () => p("device_key.pem");
const deviceIdPath = () => p("device_id");

const accountsUrl = () => (process.env.SQAI_ACCOUNTS_URL ?? DEFAULT_ACCOUNTS_URL).replace(/\/$/, "");
const apiUrl = () => (process.env.SQAI_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");

function readSecret(path: string): string | undefined {
  try {
    const v = readFileSync(path, "utf8").trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the SQAI API key for the runtime: $SQAI_API_KEY, legacy env, else the cached key. */
export async function readCachedApiKey(): Promise<string | undefined> {
  return process.env.SQAI_API_KEY ?? process.env.ALGENTA_API_KEY ?? readSecret(apiKeyPath());
}

/**
 * The one device-login gate for local execution, shared by every surface.
 *
 * An explicit env key (current or legacy) wins; otherwise the key cached by
 * `sqai login` under ~/.sqai is promoted into the environment so the runtime
 * daemon inherits it; otherwise a structured `login_required` SqaiError. The
 * managed-runtime provisioner runs this before spawning the daemon
 * (runtime/provision.ts), and the MCP server runs it before every tools/call —
 * local-mode licensing has exactly one mechanism, so every execution surface
 * fails with the identical error.
 */
export async function ensureLocalLoginKey(): Promise<void> {
  if (process.env.ALGENTA_API_KEY || process.env.DE_API_KEY) {
    return;
  }
  const key = await readCachedApiKey();
  if (key) {
    process.env.ALGENTA_API_KEY = key;
    return;
  }
  throw new SqaiError(
    "login_required",
    "Local compute requires a free SQAI device login. Run `sqai login` once, " +
      "or set SQAI_API_KEY in this process.",
    { details: { reason: "login_key_missing" } },
  );
}

function cache(path: string, value: string): void {
  mkdirSync(sqaiHome(), { recursive: true });
  writeFileSync(path, value.trim() + "\n", "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without POSIX perms (Windows)
  }
}

// ── device identity: stable id + Ed25519 keypair whose thumbprint binds the license to this machine ──

function deviceId(): string {
  const existing = readSecret(deviceIdPath());
  if (existing) return existing;
  const value = createHash("sha256")
    .update(`${hostname()}:${Date.now()}:${Math.random()}`)
    .digest("hex");
  cache(deviceIdPath(), value);
  return value;
}

function loadOrMakeDeviceKey(): KeyObject {
  if (existsSync(deviceKeyPath())) {
    return createPrivateKey(readFileSync(deviceKeyPath()));
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  mkdirSync(sqaiHome(), { recursive: true });
  writeFileSync(deviceKeyPath(), pem, "utf8");
  try {
    chmodSync(deviceKeyPath(), 0o600);
  } catch {
    /* best-effort */
  }
  return privateKey;
}

/** `ed25519:<b64url(sha256(raw_pub))>` — the control plane's device-binding format. */
function deviceThumbprint(): string {
  const pub = createPublicKey(loadOrMakeDeviceKey());
  const jwk = pub.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new LoginError("could not derive device public key");
  const rawPub = Buffer.from(jwk.x, "base64url");
  const b64 = createHash("sha256").update(rawPub).digest("base64url").replace(/=+$/, "");
  return `ed25519:${b64}`;
}

/** Stable, privacy-preserving machine fingerprint (required for finite-device plans). */
function hostnameHash(): string {
  return createHash("sha256").update(hostname()).digest("hex");
}

function platformTag(): string {
  const m = process.arch;
  const arch = m === "arm64" ? "arm64" : m === "x64" ? "x86_64" : m;
  const plat = process.platform;
  const osn = plat === "darwin" ? "macos" : plat === "win32" ? "windows" : plat === "linux" ? "linux" : plat;
  return `${osn}-${arch}`;
}

// ── HTTP (global fetch; small JSON; Bearer) ─────────────────────────────────────────────────

async function request(
  method: string,
  url: string,
  opts: { bearer?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "sqai-cli" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new LoginError(`${method} ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

// ── OAuth 2.0 device authorization grant (RFC 8628) ─────────────────────────────────────────

async function deviceAuthorize(accounts: string, openBrowser: boolean, maxWaitMs = 300_000): Promise<string> {
  const { json: start } = await request("POST", `${accounts}/oauth/device/code`, {
    body: { client_id: CLIENT_ID, scope: SCOPE },
  });
  const deviceCode = start.device_code as string | undefined;
  const userCode = start.user_code as string | undefined;
  const verify = (start.verification_uri_complete as string) || (start.verification_uri as string);
  const interval = Number(start.interval ?? 5);
  if (!deviceCode || !userCode || !verify) throw new LoginError("accounts device-code response missing fields");
  process.stdout.write(`\n  Open ${verify}\n  and enter code:  ${userCode}\n\n`);
  if (openBrowser) await tryOpenBrowser(verify);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    const { status, json: tok } = await request("POST", `${accounts}/oauth/device/token`, {
      body: {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
    });
    const access = tok.access_token as string | undefined;
    if (access) return access;
    const error = tok.error as string | undefined;
    if (error === "authorization_pending" || error === "slow_down" || status === 400 || status === 428) continue;
    throw new LoginError(`device authorization failed: ${error ?? `HTTP ${status}`}`);
  }
  throw new LoginError("timed out waiting for device authorization");
}

async function tryOpenBrowser(url: string): Promise<void> {
  try {
    const { spawn } = await import("node:child_process");
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    // headless: the code is printed above
  }
}

// ── control-plane onboarding (canonical parametric route: POST /v1/products/sqai/onboard) ────

async function createApiKey(api: string, accessToken: string, plan: string): Promise<string> {
  const { status, json } = await request("POST", `${api}/v1/products/${PRODUCT}/onboard`, {
    bearer: accessToken,
    body: { name: CLIENT_ID, product: PRODUCT, plan },
  });
  const key = (json.raw_key as string) || (json.key as string) || (json.api_key as string);
  if (status >= 400 || !key) {
    const detail =
      json.error && typeof json.error === "object" ? (json.error as { message?: string }).message : undefined;
    throw new LoginError(`could not create API key (HTTP ${status})${detail ? `: ${detail}` : ""}`);
  }
  return key;
}

// ── orchestration ────────────────────────────────────────────────────────────────────────

export interface LoginResult {
  device_id: string;
  plan: string;
  api_key_prefix: string;
}

export async function login(
  opts: { plan?: string; accessToken?: string; openBrowser?: boolean } = {},
): Promise<LoginResult> {
  const plan = opts.plan ?? DEFAULT_PLAN;
  const accounts = accountsUrl();
  const api = apiUrl();
  let token = opts.accessToken ?? process.env.SQAI_TOKEN;
  if (token) {
    process.stdout.write("using supplied token (headless)\n");
  } else {
    process.stdout.write(`authenticating via ${accounts} …\n`);
    token = await deviceAuthorize(accounts, opts.openBrowser ?? true);
  }
  cache(tokenPath(), token);

  process.stdout.write("creating your free SQAI Developer API key …\n");
  const apiKey = await createApiKey(api, token, plan);
  cache(apiKeyPath(), apiKey);
  deviceId(); // ensure device identity exists so the daemon's first device/register is deterministic

  process.stdout.write(
    "\n  ✓ sqai login complete — the local runtime will provision a device-bound offline license on " +
      "first use.\n  SQAI runs fully on your machine; no data leaves it.\n\n",
  );
  return {
    device_id: deviceId(),
    plan,
    api_key_prefix: apiKey.includes("_") ? `${apiKey.split("_", 1)[0]}_…` : `${apiKey.slice(0, 6)}…`,
  };
}

/** Remove cached token + API key (keeps the device identity so a re-login rebinds the same device). */
export function logout(): void {
  for (const path of [tokenPath(), apiKeyPath()]) {
    try {
      rmSync(path);
    } catch {
      /* already absent */
    }
  }
}

// Exposed for the daemon-binding thumbprint / register body (used by tests + future direct register).
export const _internal = { deviceId, deviceThumbprint, hostnameHash, platformTag };
