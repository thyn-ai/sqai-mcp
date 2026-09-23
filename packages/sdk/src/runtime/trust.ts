/** Embedded trust root for signed managed-runtime bundles.
 *
 * The provisioner only installs bundles whose manifest signature (RS256 —
 * RSASSA-PKCS1-v1_5 + SHA-256 over the exact shipped manifest bytes) verifies
 * against one of these keys. Revocation and rollback protection live here so
 * a single release-process edit rotates the whole trust posture:
 *
 *   - TRUSTED_KEYS       the accepted verification keys (key_id + PEM)
 *   - REVOKED_KEY_IDS    key_ids that must never verify again
 *   - MIN_ACCEPTED_RUNTIME_VERSION
 *                        the rollback floor: bundle manifests whose
 *                        runtime_bundle_version compares below this are
 *                        rejected (reason `rollback_protected`)
 *
 * Tests (and the release process) can override every value through
 * RuntimeProvisioner options — nothing here is reachable from user input.
 */

import { createPublicKey, verify as cryptoVerify } from "node:crypto";

export interface TrustedKey {
  key_id: string;
  algorithm: "RS256";
  public_key_pem: string;
  /** ISO-8601 instant; key is not accepted before it. */
  valid_from?: string;
  /** ISO-8601 instant; key is not accepted after it. */
  valid_to?: string;
}

export interface TrustRoot {
  trustedKeys: readonly TrustedKey[];
  revokedKeyIds: readonly string[];
  minAcceptedRuntimeVersion: string;
}

/**
 * Production bundle-signing public key (release 1), RSA-4096.
 *
 * The matching private key is held only as the `ALGENTA_BUNDLE_SIGNING_PRIVATE_KEY`
 * release signing key (and offline by the release owner).
 * To rotate: add the new key here with a fresh key_id, move the retired id into
 * REVOKED_KEY_IDS, and raise MIN_ACCEPTED_RUNTIME_VERSION.
 */
const RELEASE_1_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA7m4G1dEMi5FppLa5hu9N
4pUyoGELPaN5X7bO+9Qktgbv21+c8I4sQCufKouZEVNMNluKNrWcQ5dSwOuVxxS9
oek4XtY0376t+jwsv6j677wmhmqMTIZoc/p9wwG1xfEcaDaGufg5GldD/eE3Ua0k
q4WYYKcG+AHs6DvPEgRkkQEsyirBuqLpL+LDBcd2ZlXW+IoAojBe253e+8zKBo0c
kyjcJ7WIvK//gkI4HgUClVSBFYV1ZjfZ52QXmNpuvCp+8NsXuBvw5R1jTGvJROx+
m8M1tcIBssVqFIJyOhZwhJFxwbaBEjfhV0DAvDp/pEKH3HQ/yMMeBkgv/e/XNUf4
W2fvN6Lrb990ECiV6sfCBLENfz/ubjgXe1VyViGrcxJJrY6Ij7dN8K82sJ0BbExl
Rlu3VNGKn5Bbpywhv/Qx8/bsw51QJDuLHRlQWaNI5fmPttZdeLJadhgh9f/NyFlv
PkWU0Nil+HMR8BniiTcHBxddzfdywipnp1zjhuk4JntdB/iNmW7QDAflp563uPmJ
MrdigQUxijjD7mFEQk3R07mcQ63+x1t2yBQEBgToPFXBnQZEG2ZLOQGdbp+ZRps0
ODNTaAW0lR1gC4uXdMHkuQ8Z/uhZHCJEnvqkflFUMNI1lJJ+qyY4Ec6A6nxHjifE
0K7sxAmqQJ7FVxyih2RkmB8CAwEAAQ==
-----END PUBLIC KEY-----`;

export const TRUSTED_KEYS: readonly TrustedKey[] = [
  {
    key_id: "algenta-runtime-bundle-release-1",
    algorithm: "RS256",
    public_key_pem: RELEASE_1_PUBLIC_KEY_PEM,
  },
];

/** key_ids that must never verify a bundle again (compromised / retired). */
export const REVOKED_KEY_IDS: readonly string[] = ["algenta-runtime-bundle-dev-placeholder"];

/** Rollback floor: manifests with runtime_bundle_version below this are rejected. */
export const MIN_ACCEPTED_RUNTIME_VERSION = "0.1.0";

export function defaultTrustRoot(): TrustRoot {
  return {
    trustedKeys: TRUSTED_KEYS,
    revokedKeyIds: REVOKED_KEY_IDS,
    minAcceptedRuntimeVersion: MIN_ACCEPTED_RUNTIME_VERSION,
  };
}

/**
 * Semver-ish comparison shared verbatim with the Python SDK (`_trust.py`).
 *
 * `<main>[-<prerelease>]`; main compares as dot-separated numeric segments
 * (missing segments are 0; non-numeric segments compare as strings), and a
 * prerelease sorts BELOW the same main version without one.
 */
export function compareRuntimeVersions(a: string, b: string): number {
  const [aMain, aPre] = splitPrerelease(a);
  const [bMain, bPre] = splitPrerelease(b);
  const aSegments = aMain.split(".");
  const bSegments = bMain.split(".");
  const length = Math.max(aSegments.length, bSegments.length);
  for (let index = 0; index < length; index += 1) {
    const left = aSegments[index] ?? "0";
    const right = bSegments[index] ?? "0";
    const compared = compareSegment(left, right);
    if (compared !== 0) {
      return compared;
    }
  }
  if (aPre === bPre) {
    return 0;
  }
  if (aPre === null) {
    return 1;
  }
  if (bPre === null) {
    return -1;
  }
  return aPre < bPre ? -1 : 1;
}

function splitPrerelease(version: string): [string, string | null] {
  const separator = version.indexOf("-");
  if (separator === -1) {
    return [version, null];
  }
  return [version.slice(0, separator), version.slice(separator + 1)];
}

function compareSegment(left: string, right: string): number {
  const numericLeft = /^\d+$/.test(left) ? Number.parseInt(left, 10) : null;
  const numericRight = /^\d+$/.test(right) ? Number.parseInt(right, 10) : null;
  if (numericLeft !== null && numericRight !== null) {
    return numericLeft === numericRight ? 0 : numericLeft < numericRight ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Raised by trust-root verification with a machine-readable `reason`. */
export class TrustVerificationError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "TrustVerificationError";
    this.reason = reason;
  }
}

function keyValidNow(key: TrustedKey, nowMs: number): boolean {
  if (key.valid_from) {
    const from = Date.parse(key.valid_from);
    if (Number.isFinite(from) && nowMs < from) {
      return false;
    }
  }
  if (key.valid_to) {
    const to = Date.parse(key.valid_to);
    if (Number.isFinite(to) && nowMs > to) {
      return false;
    }
  }
  return true;
}

function signatureVerifies(manifestBytes: Buffer, signature: Buffer, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "rsa") {
      return false;
    }
    // node:crypto default RSA padding is RSASSA-PKCS1-v1_5 — RS256 with sha256.
    return cryptoVerify("sha256", manifestBytes, key, signature);
  } catch {
    return false;
  }
}

/**
 * Verify an RS256 manifest signature against the trust root.
 *
 * Returns the `key_id` that verified. Fails closed with a precise reason:
 *   - `trusted_key_revoked`  the signature verifies ONLY against a revoked key
 *   - `trusted_key_expired`  it verifies only against a key outside its window
 *   - `manifest_signature_invalid` no trusted key verifies the signature
 *   - `no_trusted_keys`      the trust root is empty
 */
export function verifyManifestSignatureAgainstTrustRoot(
  manifestBytes: Buffer,
  signature: Buffer,
  trustRoot: TrustRoot,
  nowMs: number = Date.now(),
): string {
  if (trustRoot.trustedKeys.length === 0) {
    throw new TrustVerificationError("no_trusted_keys", "the embedded trust root has no keys");
  }
  const revoked = new Set(trustRoot.revokedKeyIds);
  let revokedMatch: string | null = null;
  let expiredMatch: string | null = null;
  for (const key of trustRoot.trustedKeys) {
    if (key.algorithm !== "RS256") {
      continue;
    }
    if (!signatureVerifies(manifestBytes, signature, key.public_key_pem)) {
      continue;
    }
    if (revoked.has(key.key_id)) {
      revokedMatch = key.key_id;
      continue;
    }
    if (!keyValidNow(key, nowMs)) {
      expiredMatch = key.key_id;
      continue;
    }
    return key.key_id;
  }
  if (revokedMatch !== null) {
    throw new TrustVerificationError(
      "trusted_key_revoked",
      `bundle is signed by REVOKED key '${revokedMatch}'`,
    );
  }
  if (expiredMatch !== null) {
    throw new TrustVerificationError(
      "trusted_key_expired",
      `bundle is signed by key '${expiredMatch}' outside its validity window`,
    );
  }
  throw new TrustVerificationError(
    "manifest_signature_invalid",
    "manifest signature does not verify against any trusted bundle key",
  );
}
