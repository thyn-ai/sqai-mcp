import { describe, expect, it, vi } from "vitest";

import { ResultStore } from "./results.js";

describe("result store", () => {
  it("ids are opaque and unlinkable — same value stored twice gets different ids", () => {
    const store = new ResultStore();
    // Distinctive identifiers, not 2-char tokens: a random 22-char id contains a given
    // 2-char string (e.g. "t1"/"s1") ~1% of the time — a real flake. Long, distinctive
    // ids keep the leak check meaningful while making chance collision astronomically small.
    const meta = { tenantId: "tenant-abc123xyz", sourceIds: ["source-def456uvw"] };
    const first = store.store({ rows: [1, 2, 3] }, meta);
    const second = store.store({ rows: [1, 2, 3] }, meta);
    expect(first).not.toBe(second); // same value + metadata → different id (unlinkable)
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/); // opaque, fixed-width, no delimiters
    expect(first).not.toContain("tenant-abc123xyz"); // id does not embed the tenant
    expect(first).not.toContain("source-def456uvw"); // …or the source
  });

  it("authorization is enforced through stored tenant metadata", () => {
    const store = new ResultStore();
    const id = store.store({ secret: true }, { tenantId: "tenant-a", sourceIds: [] });
    expect(store.get(id, "tenant-a").value).toEqual({ secret: true });
    expect(() => store.get(id, "tenant-b")).toThrowError(
      expect.objectContaining({ code: "result_not_found" }),
    );
    expect(() => store.get("nonexistent", "tenant-a")).toThrowError(
      expect.objectContaining({ code: "result_not_found" }),
    );
  });

  it("records carry source_ids (plural) and byte size", () => {
    const store = new ResultStore();
    const id = store.store([1, 2], { tenantId: null, sourceIds: ["a", "b"] });
    const record = store.get(id, null);
    expect(record.source_ids).toEqual(["a", "b"]);
    expect(record.byte_size).toBeGreaterThan(0);
  });

  it("TTL evicts expired results", () => {
    vi.useFakeTimers();
    try {
      const store = new ResultStore({ ttlMs: 1000 });
      const id = store.store("value", { tenantId: null, sourceIds: [] });
      vi.advanceTimersByTime(1500);
      expect(() => store.get(id, null)).toThrowError(
        expect.objectContaining({ code: "result_not_found" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("maxResultCount evicts oldest", () => {
    const store = new ResultStore({ maxResultCount: 2 });
    const first = store.store(1, { tenantId: null, sourceIds: [] });
    store.store(2, { tenantId: null, sourceIds: [] });
    store.store(3, { tenantId: null, sourceIds: [] });
    expect(() => store.get(first, null)).toThrowError(
      expect.objectContaining({ code: "result_not_found" }),
    );
  });

  it("deleteResult removes only for the owning tenant", () => {
    const store = new ResultStore();
    const id = store.store("v", { tenantId: "t1", sourceIds: [] });
    store.delete(id, "t2");
    expect(store.get(id, "t1").value).toBe("v");
    store.delete(id, "t1");
    expect(() => store.get(id, "t1")).toThrowError(
      expect.objectContaining({ code: "result_not_found" }),
    );
  });
});
