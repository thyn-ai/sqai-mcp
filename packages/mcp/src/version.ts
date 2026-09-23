/** Server version = the published package version. Read from the package.json
 * that always sits next to dist/ (and next to src/ under vitest), so the
 * initialize handshake can never drift from the released artifact. Fails
 * loudly: a wrong version string is worse than a startup error. */

import { readFileSync } from "node:fs";

export function serverVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(packageJsonUrl, "utf-8"));
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof (parsed as { version: unknown }).version === "string"
  ) {
    return (parsed as { version: string }).version;
  }
  throw new Error(`sqai-mcp: no version string in ${packageJsonUrl.pathname}`);
}
