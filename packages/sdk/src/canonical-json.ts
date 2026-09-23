/** Canonical JSON serialization shared byte-for-byte with the Python SDK
 * (sqai/_canonical_json.py). Both SDKs hash plans and intents with sha256
 * over this exact rendering — invocation_hash / computation_hash /
 * input_hash parity depends on it.
 *
 * Provenance: this is the exact algorithm the SQAI substrate shipped as
 * algenta-sdk's canonicalJson through the 1.0.6 line. The post-Mojo-1.0.0
 * substrate (1.0.7+) dropped the cross-language canonical renderer, so SQAI
 * vendors it verbatim to keep hashes identical across languages and across
 * the substrate bump. Do NOT edit the rendering rules.
 *
 * Rules: sorted keys, "," / ":" separators, non-ASCII escaped as \uXXXX,
 * numbers as ECMAScript String(number) with -0 normalized to 0,
 * NaN/Infinity rejected, undefined object entries omitted. */

function escapeNonAscii(json: string): string {
  return json.replace(/[\u0080-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("NaN and Infinity cannot appear in canonically hashed payloads");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    return escapeNonAscii(JSON.stringify(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort();
    return `{${keys
      .map(key => `${escapeNonAscii(JSON.stringify(key))}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return escapeNonAscii(JSON.stringify(String(value)));
}
