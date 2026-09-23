import { describe, expect, it } from "vitest";

import { inferMode, readEnv } from "./env.js";
import { SQAI } from "./sqai.js";

describe("SQAI environment mapping", () => {
  it("uses SQAI_DEPLOYMENT_URL for deployment mode", () => {
    const env = readEnv({
      SQAI_DEPLOYMENT_URL: "https://sqai.example.com",
      SQAI_API_KEY: "key",
    } as NodeJS.ProcessEnv);

    expect(env.deploymentUrl).toBe("https://sqai.example.com");
    expect(inferMode(undefined, env)).toBe("deployment");
  });

  it("does not let SQAI_API_KEY alone select a remote compute mode", () => {
    const env = readEnv({ SQAI_API_KEY: "key" } as NodeJS.ProcessEnv);

    expect(env.apiKey).toBe("key");
    expect(env.deploymentUrl).toBeUndefined();
    expect(inferMode(undefined, env)).toBe("local");
  });

  it("accepts deploymentUrl in code config", async () => {
    const client = new SQAI({
      mode: "deployment",
      deploymentUrl: "https://sqai.example.com",
      computeTarget: {
        kind: "http",
        baseUrl: "https://sqai.example.com",
        fetchImpl: async () =>
          new Response(JSON.stringify({ result: 7 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    });

    expect((client as unknown as { deploymentUrl: string }).deploymentUrl).toBe("https://sqai.example.com");
    await expect(
      client.compute({ module: "stats", function: "median", args: [[7], 1] }),
    ).resolves.toMatchObject({ value: 7 });
  });
});
