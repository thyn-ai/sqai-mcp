/** Opaque, authorized result store.
 *
 * result_id is random (never derived from tenant/source/schema/hash material),
 * so the identifier is unlinkable and reveals nothing — including whether a
 * result exists. Authorization is enforced through stored tenant metadata:
 * a lookup from the wrong tenant returns the same result_not_found as a
 * missing id.
 */

import { randomBytes } from "node:crypto";

import { SqaiError } from "./errors.js";
import type { ResultStoreConfig, SqaiResultRecord } from "./types.js";

const DEFAULTS: Required<ResultStoreConfig> = {
  ttlMs: 15 * 60 * 1000,
  maxResultCount: 256,
  maxStoredResultBytes: 64 * 1024 * 1024,
  maxTenantResultBytes: 16 * 1024 * 1024,
};

export class ResultStore {
  private readonly config: Required<ResultStoreConfig>;
  private readonly records = new Map<string, SqaiResultRecord>();
  private totalBytes = 0;

  constructor(config: ResultStoreConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  store(value: unknown, options: { tenantId: string | null; sourceIds: string[] }): string {
    this.evictExpired();
    const resultId = randomBytes(16).toString("base64url");
    const byteSize = Buffer.byteLength(JSON.stringify(value ?? null), "utf-8");
    const now = Date.now();

    while (
      this.records.size >= this.config.maxResultCount ||
      (this.totalBytes + byteSize > this.config.maxStoredResultBytes && this.records.size > 0)
    ) {
      this.evictOldest();
    }
    if (byteSize > this.config.maxStoredResultBytes) {
      // A single oversized result is never stored; callers still return the
      // truncated preview, just without a retrievable handle.
      return resultId;
    }
    const tenantBytes = this.tenantBytes(options.tenantId);
    if (tenantBytes + byteSize > this.config.maxTenantResultBytes) {
      this.evictOldestForTenant(options.tenantId);
    }

    this.records.set(resultId, {
      result_id: resultId,
      tenant_id: options.tenantId,
      source_ids: [...options.sourceIds],
      created_at: now,
      expires_at: now + this.config.ttlMs,
      byte_size: byteSize,
      value,
    });
    this.totalBytes += byteSize;
    return resultId;
  }

  get(resultId: string, tenantId: string | null): SqaiResultRecord {
    this.evictExpired();
    const record = this.records.get(resultId);
    if (!record || record.tenant_id !== tenantId) {
      throw new SqaiError("result_not_found", "No such result for this principal.", {
        details: {},
      });
    }
    return record;
  }

  delete(resultId: string, tenantId: string | null): void {
    const record = this.records.get(resultId);
    if (record && record.tenant_id === tenantId) {
      this.records.delete(resultId);
      this.totalBytes -= record.byte_size;
    }
  }

  private tenantBytes(tenantId: string | null): number {
    let total = 0;
    for (const record of this.records.values()) {
      if (record.tenant_id === tenantId) {
        total += record.byte_size;
      }
    }
    return total;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.records) {
      if (record.expires_at <= now) {
        this.records.delete(id);
        this.totalBytes -= record.byte_size;
      }
    }
  }

  private evictOldest(): void {
    const oldest = this.records.keys().next();
    if (!oldest.done) {
      const record = this.records.get(oldest.value);
      this.records.delete(oldest.value);
      this.totalBytes -= record?.byte_size ?? 0;
    }
  }

  private evictOldestForTenant(tenantId: string | null): void {
    for (const [id, record] of this.records) {
      if (record.tenant_id === tenantId) {
        this.records.delete(id);
        this.totalBytes -= record.byte_size;
        return;
      }
    }
  }
}
