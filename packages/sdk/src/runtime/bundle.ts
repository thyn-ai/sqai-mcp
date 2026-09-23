/** Signed managed-runtime bundle verification + installation primitives.
 *
 * Mirrors the upstream reference verifier
 * verification path — verification fails closed at every step:
 *
 *   1. read manifest.json + manifest.sig bytes FROM the archive (hard size
 *      caps BEFORE any allocation — the bundle is attacker-controlled until
 *      verified)
 *   2. verify the RS256 signature over those EXACT manifest bytes against the
 *      embedded trust root (never re-serialize before verifying)
 *   3. schema-check the manifest (format version, artifact entries, path
 *      safety: reject absolute paths, "..", empty segments) + rollback floor
 *   4. stream-hash every artifact member against the signed sha256 + size
 *      (regular files only — symlinks / hardlinks / devices rejected)
 *   5. reject any archive member the signed manifest does not name
 *
 * Archive access goes through the system `tar` binary (`tar -xOf` for capped
 * member reads and per-artifact hashing, `tar -tf`/`tar -tvf` for the member
 * listing, `tar -xf` for the final extraction) so the exact tool that
 * extracts is the tool whose name/type interpretation was verified. Member
 * names are always passed after a `--` end-of-options separator.
 */

import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { join } from "node:path";

import {
  compareRuntimeVersions,
  TrustVerificationError,
  verifyManifestSignatureAgainstTrustRoot,
  type TrustRoot,
} from "./trust.js";

export const MANIFEST_NAME = "manifest.json";
export const MANIFEST_SIG_NAME = "manifest.sig";
export const BUNDLE_FORMAT_VERSION = 1;

// Hard caps enforced BEFORE the signature is checked (anti-OOM: a tiny gzip
// member can declare a multi-GB size). Artifacts are additionally bounded by
// the SIGNED manifest size once the signature verifies.
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_SIG_BYTES = 64 * 1024; // 64 KB
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB per artifact

export interface BundleArtifact {
  path: string;
  sha256: string;
  size: number;
}

export interface BundleManifest {
  bundle_format_version: number;
  runtime_bundle_version: string;
  platform: string;
  created_at: string;
  engine_stub: boolean;
  artifacts: BundleArtifact[];
}

/** Any signature / integrity / path-safety check failed. Fail closed. */
export class BundleVerificationError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "BundleVerificationError";
    this.reason = reason;
  }
}

// ── Path safety ───────────────────────────────────────────────────────────────

/** True only for a normalized, relative, traversal-free archive path. */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) {
    return false;
  }
  if (path.includes("\\") || path.includes("\0")) {
    return false;
  }
  // Stricter than the reference: control characters (esp. newlines) are
  // rejected because member listings from the system tar are line-based.
  // The bundle builder never produces such names.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) {
    return false;
  }
  return path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

// ── System tar plumbing ───────────────────────────────────────────────────────

interface TarCaptureResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function runTarCapture(args: string[], maxStdoutBytes: number): Promise<TarCaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = "";
    let overflow = false;
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxStdoutBytes) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", code => {
      if (overflow) {
        reject(new BundleVerificationError("member_too_large", "tar output exceeded the size cap"));
        return;
      }
      resolve({ code: code ?? 1, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

/** Capped read of one archive member (`tar -xOf … -- <member>`). */
async function readTarMember(tarball: string, member: string, maxBytes: number): Promise<Buffer> {
  let result: TarCaptureResult;
  try {
    result = await runTarCapture(["-xOf", tarball, "--", member], maxBytes);
  } catch (error) {
    if (error instanceof BundleVerificationError) {
      throw new BundleVerificationError(
        error.reason,
        `bundle member '${member}' exceeds the ${maxBytes}-byte cap`,
      );
    }
    throw error;
  }
  if (result.code !== 0) {
    throw new BundleVerificationError(
      "member_unreadable",
      `bundle is missing member '${member}' (or it could not be read)`,
    );
  }
  return result.stdout;
}

export type TarMemberType = "file" | "dir" | "symlink" | "hardlink" | "other";

export interface TarMember {
  name: string;
  type: TarMemberType;
}

function memberTypeFromModeChar(modeChar: string): TarMemberType {
  switch (modeChar) {
    case "-":
      return "file";
    case "d":
      return "dir";
    case "l":
      return "symlink";
    case "h":
      return "hardlink";
    default:
      return "other";
  }
}

/**
 * List archive members with types by pairing `tar -tf` (exact names) with
 * `tar -tvf` (type char is the first character of each line). Any disagreement
 * between the two listings fails closed.
 */
export async function listTarMembers(tarball: string): Promise<TarMember[]> {
  const namesResult = await runTarCapture(["-tf", tarball], MAX_MANIFEST_BYTES);
  const verboseResult = await runTarCapture(["-tvf", tarball], 4 * MAX_MANIFEST_BYTES);
  if (namesResult.code !== 0 || verboseResult.code !== 0) {
    throw new BundleVerificationError("archive_unreadable", "the bundle archive could not be listed");
  }
  const nameLines = namesResult.stdout.toString("utf-8").split("\n").filter(line => line.length > 0);
  const verboseLines = verboseResult.stdout
    .toString("utf-8")
    .split("\n")
    .filter(line => line.length > 0);
  if (nameLines.length !== verboseLines.length) {
    throw new BundleVerificationError(
      "unsafe_member",
      "archive member listings disagree (possible control characters in member names)",
    );
  }
  return nameLines.map((rawName, index) => {
    const type = memberTypeFromModeChar(verboseLines[index]?.charAt(0) ?? "?");
    const name = type === "dir" && rawName.endsWith("/") ? rawName.slice(0, -1) : rawName;
    return { name, type };
  });
}

function requireSafeMember(member: TarMember): void {
  if (!isSafeRelativePath(member.name)) {
    throw new BundleVerificationError(
      "unsafe_member",
      `unsafe path in bundle member: '${member.name}'`,
    );
  }
  if (member.type === "symlink" || member.type === "hardlink") {
    throw new BundleVerificationError("unsafe_member", `link member rejected: '${member.name}'`);
  }
  if (member.type !== "file" && member.type !== "dir") {
    throw new BundleVerificationError(
      "unsafe_member",
      `non-regular member rejected: '${member.name}'`,
    );
  }
}

/** Stream one member through sha256 without touching disk. */
async function hashTarMember(
  tarball: string,
  member: string,
  cap: number,
): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xOf", tarball, "--", member], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const digest = createHash("sha256");
    let total = 0;
    let overflow = false;
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > cap) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      digest.update(chunk);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (overflow) {
        reject(
          new BundleVerificationError(
            "artifact_size_mismatch",
            `artifact '${member}' exceeds its signed size`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new BundleVerificationError("artifact_missing", `artifact '${member}' could not be read`),
        );
        return;
      }
      resolve({ sha256: digest.digest("hex"), size: total });
    });
  });
}

/** Extract the (already fully verified) archive with the system tar. */
export async function extractTarball(tarball: string, destinationDir: string): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", tarball, "-C", destinationDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new BundleVerificationError(
            "extract_failed",
            `tar extraction failed (exit ${code}): ${stderr.slice(0, 300)}`,
          ),
        );
      }
    });
  });
}

// ── Hashing helpers ───────────────────────────────────────────────────────────

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", chunk => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

/** Constant-time hex digest comparison (mirrors hmac.compare_digest). */
export function digestsEqual(actualHex: string, expectedHex: string): boolean {
  const actual = Buffer.from(actualHex.toLowerCase(), "utf-8");
  const expected = Buffer.from(expectedHex.toLowerCase(), "utf-8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isGeneratedBytecodeCache(path: string): boolean {
  return path.split("/").includes("__pycache__") && path.endsWith(".pyc") && isSafeRelativePath(path);
}

// ── Manifest schema ───────────────────────────────────────────────────────────

/** JSON.parse AFTER signature verification, then schema + path-safety checks. */
export function parseVerifiedManifest(manifestBytes: Buffer): BundleManifest {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf-8"));
  } catch (error) {
    throw new BundleVerificationError(
      "manifest_schema_invalid",
      `manifest verified but is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new BundleVerificationError("manifest_schema_invalid", "manifest is not a JSON object");
  }
  const candidate = manifest as Record<string, unknown>;
  if (candidate.bundle_format_version !== BUNDLE_FORMAT_VERSION) {
    throw new BundleVerificationError(
      "manifest_schema_invalid",
      `unsupported bundle_format_version: ${JSON.stringify(candidate.bundle_format_version)}`,
    );
  }
  for (const field of ["runtime_bundle_version", "platform", "created_at"] as const) {
    if (typeof candidate[field] !== "string" || candidate[field] === "") {
      throw new BundleVerificationError(
        "manifest_schema_invalid",
        `manifest missing string field '${field}'`,
      );
    }
  }
  if (typeof candidate.engine_stub !== "boolean") {
    throw new BundleVerificationError(
      "manifest_schema_invalid",
      "manifest missing boolean field 'engine_stub'",
    );
  }
  const artifacts = candidate.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new BundleVerificationError(
      "manifest_schema_invalid",
      "manifest missing a non-empty 'artifacts' list",
    );
  }
  const seen = new Set<string>();
  for (const entry of artifacts) {
    const artifact = entry as Partial<BundleArtifact> | null;
    if (
      typeof artifact !== "object" ||
      artifact === null ||
      typeof artifact.path !== "string" ||
      typeof artifact.sha256 !== "string" ||
      artifact.sha256.length !== 64 ||
      typeof artifact.size !== "number" ||
      !Number.isInteger(artifact.size) ||
      artifact.size < 0
    ) {
      throw new BundleVerificationError(
        "manifest_schema_invalid",
        `manifest artifact entry malformed: ${JSON.stringify(entry).slice(0, 200)}`,
      );
    }
    const path = artifact.path;
    if (!isSafeRelativePath(path) || path === MANIFEST_NAME || path === MANIFEST_SIG_NAME) {
      throw new BundleVerificationError(
        "manifest_schema_invalid",
        `unsafe artifact path in manifest: '${path}'`,
      );
    }
    if (seen.has(path)) {
      throw new BundleVerificationError(
        "manifest_schema_invalid",
        `duplicate artifact path in manifest: '${path}'`,
      );
    }
    seen.add(path);
  }
  return candidate as unknown as BundleManifest;
}

// ── Cross-cutting manifest policy (trust root, rollback, pins) ────────────────

export interface ManifestExpectations {
  trustRoot: TrustRoot;
  /** The contract-pinned bundle version this manifest must carry. */
  expectedVersion?: string;
  /** The platform key this bundle must target. */
  expectedPlatform?: string;
}

function verifyManifestPolicy(manifest: BundleManifest, expectations: ManifestExpectations): void {
  const version = manifest.runtime_bundle_version;
  if (compareRuntimeVersions(version, expectations.trustRoot.minAcceptedRuntimeVersion) < 0) {
    throw new BundleVerificationError(
      "rollback_protected",
      `bundle version ${version} is below the minimum accepted runtime version ` +
        `${expectations.trustRoot.minAcceptedRuntimeVersion} (rollback protection)`,
    );
  }
  if (expectations.expectedVersion !== undefined && version !== expectations.expectedVersion) {
    throw new BundleVerificationError(
      "version_mismatch",
      `bundle manifest carries version ${version}, expected ${expectations.expectedVersion}`,
    );
  }
  if (
    expectations.expectedPlatform !== undefined &&
    manifest.platform !== expectations.expectedPlatform
  ) {
    throw new BundleVerificationError(
      "bundle_platform_mismatch",
      `bundle targets platform '${manifest.platform}', expected '${expectations.expectedPlatform}'`,
    );
  }
}

function verifySignatureBytes(
  manifestBytes: Buffer,
  signature: Buffer,
  trustRoot: TrustRoot,
): string {
  try {
    return verifyManifestSignatureAgainstTrustRoot(manifestBytes, signature, trustRoot);
  } catch (error) {
    if (error instanceof TrustVerificationError) {
      throw new BundleVerificationError(error.reason, error.message);
    }
    throw error;
  }
}

// ── Full tarball verification (reference-verifier mirror) ─────────────────────

/**
 * Verify signature, per-artifact integrity, and path safety of a bundle
 * tarball WITHOUT extracting anything. Returns the verified manifest.
 */
export async function verifyBundleTarball(
  tarball: string,
  expectations: ManifestExpectations,
): Promise<BundleManifest> {
  // 1 + 2: signature over the exact manifest bytes, before trusting anything.
  const manifestBytes = await readTarMember(tarball, MANIFEST_NAME, MAX_MANIFEST_BYTES);
  const signature = await readTarMember(tarball, MANIFEST_SIG_NAME, MAX_SIG_BYTES);
  verifySignatureBytes(manifestBytes, signature, expectations.trustRoot);

  // 3: schema + path safety of the now-trusted manifest, plus rollback floor
  //    and contract pins.
  const manifest = parseVerifiedManifest(manifestBytes);
  verifyManifestPolicy(manifest, expectations);
  const byPath = new Map(manifest.artifacts.map(entry => [entry.path, entry]));

  // 4 + 5: walk EVERY archive member — safety-check all, hash the listed,
  // reject unlisted regular files.
  const members = await listTarMembers(tarball);
  const verified = new Set<string>();
  for (const member of members) {
    requireSafeMember(member);
    if (member.type === "dir") {
      continue;
    }
    if (member.name === MANIFEST_NAME || member.name === MANIFEST_SIG_NAME) {
      continue;
    }
    const entry = byPath.get(member.name);
    if (entry === undefined) {
      throw new BundleVerificationError(
        "unlisted_member",
        `archive member not listed in signed manifest: '${member.name}'`,
      );
    }
    const cap = Math.min(entry.size, MAX_ARTIFACT_BYTES);
    const { sha256, size } = await hashTarMember(tarball, member.name, cap);
    if (size !== entry.size) {
      throw new BundleVerificationError(
        "artifact_size_mismatch",
        `artifact '${member.name}' size mismatch (manifest ${entry.size}, actual ${size})`,
      );
    }
    if (!digestsEqual(sha256, entry.sha256)) {
      throw new BundleVerificationError(
        "artifact_hash_mismatch",
        `artifact integrity check FAILED for '${member.name}': ` +
          `expected ${entry.sha256.slice(0, 12)}…, got ${sha256.slice(0, 12)}…`,
      );
    }
    verified.add(member.name);
  }
  const missing = manifest.artifacts.map(entry => entry.path).filter(path => !verified.has(path));
  if (missing.length > 0) {
    throw new BundleVerificationError(
      "artifact_missing",
      `manifest artifacts missing from archive: ${missing.slice(0, 5).join(", ")}`,
    );
  }
  return manifest;
}

// ── Installed-directory verification (same contract, on-disk) ────────────────

async function listFilesRecursively(root: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(join(root, relative), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relPath = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new BundleVerificationError(
        "unsafe_member",
        `symlink in installed bundle rejected: '${relPath}'`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(root, relPath)));
    } else if (entry.isFile()) {
      files.push(relPath);
    } else {
      throw new BundleVerificationError(
        "unsafe_member",
        `non-regular file in installed bundle rejected: '${relPath}'`,
      );
    }
  }
  return files;
}

/**
 * Re-verify an installed bundle directory against the trust root: manifest
 * signature, schema, rollback floor, and every artifact's sha256 + size; any
 * file on disk the signed manifest does not name is rejected.
 */
export async function verifyInstalledBundleDir(
  installDir: string,
  expectations: ManifestExpectations,
): Promise<BundleManifest> {
  const manifestPath = join(installDir, MANIFEST_NAME);
  const signaturePath = join(installDir, MANIFEST_SIG_NAME);
  let manifestBytes: Buffer;
  let signature: Buffer;
  try {
    const manifestStat = await fs.lstat(manifestPath);
    const signatureStat = await fs.lstat(signaturePath);
    if (
      !manifestStat.isFile() ||
      !signatureStat.isFile() ||
      manifestStat.size > MAX_MANIFEST_BYTES ||
      signatureStat.size > MAX_SIG_BYTES
    ) {
      throw new BundleVerificationError(
        "member_unreadable",
        "installed bundle manifest/signature is not a capped regular file",
      );
    }
    manifestBytes = await fs.readFile(manifestPath);
    signature = await fs.readFile(signaturePath);
  } catch (error) {
    if (error instanceof BundleVerificationError) {
      throw error;
    }
    throw new BundleVerificationError(
      "member_unreadable",
      "installed bundle is missing manifest.json / manifest.sig",
    );
  }
  verifySignatureBytes(manifestBytes, signature, expectations.trustRoot);
  const manifest = parseVerifiedManifest(manifestBytes);
  verifyManifestPolicy(manifest, expectations);

  const byPath = new Map(manifest.artifacts.map(entry => [entry.path, entry]));
  const files = await listFilesRecursively(installDir);
  const verified = new Set<string>();
  for (const relPath of files) {
    if (relPath === MANIFEST_NAME || relPath === MANIFEST_SIG_NAME) {
      continue;
    }
    const entry = byPath.get(relPath);
    if (entry === undefined) {
      if (isGeneratedBytecodeCache(relPath)) {
        continue;
      }
      throw new BundleVerificationError(
        "unlisted_member",
        `installed file not listed in signed manifest: '${relPath}'`,
      );
    }
    const absolute = join(installDir, relPath);
    const stat = await fs.lstat(absolute);
    if (stat.nlink > 1) {
      throw new BundleVerificationError(
        "unsafe_member",
        `hardlinked file in installed bundle rejected: '${relPath}'`,
      );
    }
    if (stat.size !== entry.size) {
      throw new BundleVerificationError(
        "artifact_size_mismatch",
        `installed artifact '${relPath}' size mismatch (manifest ${entry.size}, actual ${stat.size})`,
      );
    }
    const sha256 = await sha256File(absolute);
    if (!digestsEqual(sha256, entry.sha256)) {
      throw new BundleVerificationError(
        "artifact_hash_mismatch",
        `installed artifact integrity check FAILED for '${relPath}'`,
      );
    }
    verified.add(relPath);
  }
  const missing = manifest.artifacts.map(entry => entry.path).filter(path => !verified.has(path));
  if (missing.length > 0) {
    throw new BundleVerificationError(
      "artifact_missing",
      `manifest artifacts missing from installed bundle: ${missing.slice(0, 5).join(", ")}`,
    );
  }
  return manifest;
}

// ── Daemon entry derivation ───────────────────────────────────────────────────

/**
 * The daemon entry executable, derived from the signed manifest: the single
 * regular file directly under `daemon/` (PyInstaller onedir keeps everything
 * else in `daemon/_internal/`). Returns a bundle-relative path.
 */
export function daemonEntryFromManifest(manifest: BundleManifest): string {
  const candidates = manifest.artifacts
    .map(entry => entry.path)
    .filter(path => {
      const parts = path.split("/");
      return parts.length === 2 && parts[0] === "daemon";
    });
  if (candidates.length === 0) {
    throw new BundleVerificationError(
      "daemon_entry_not_found",
      "the signed manifest lists no daemon entry executable under daemon/",
    );
  }
  if (candidates.length > 1) {
    throw new BundleVerificationError(
      "daemon_entry_ambiguous",
      `the signed manifest lists multiple candidate daemon entries: ${candidates.join(", ")}`,
    );
  }
  return candidates[0] as string;
}
