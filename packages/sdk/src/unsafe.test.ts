import { describe, expect, it } from "vitest";

import * as unsafe from "./unsafe.js";

describe("unsafe escape hatch public surface", () => {
  it("exports only SQAI-named helpers", () => {
    expect(unsafe.getUnsafeRuntime).toEqual(expect.any(Function));
    expect(Object.hasOwn(unsafe, "getUnsafeAlgentaRuntime")).toBe(false);
  });
});
