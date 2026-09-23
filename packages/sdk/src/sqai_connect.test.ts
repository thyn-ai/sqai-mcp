import { describe, expect, it, vi } from "vitest";

import { SQAI } from "./sqai.js";
import { SQAI_CONNECTOR_TYPE_ALIASES, SQAI_CONNECTOR_TYPES } from "./types.js";
import { ORDERS } from "./fixtures/orders.js";

describe("connect", () => {
  it("exposes the full SQAI connector catalog from the upstream accepted types", () => {
    expect(SQAI_CONNECTOR_TYPES).toEqual([
      "s3",
      "gcs",
      "azure",
      "clickhouse",
      "bigquery",
      "snowflake",
      "redshift",
      "postgres",
      "postgresql",
      "sqlite",
      "mysql",
      "mssql",
      "oracle",
      "neo4j",
      "redis",
      "elastic",
      "elasticsearch",
      "rest",
      "rest_api",
      "file",
      "file_upload",
      "github_repo",
      "gitlab_repo",
      "bitbucket_repo",
      "local_repo",
      "repo_archive",
    ]);
    expect(SQAI_CONNECTOR_TYPE_ALIASES.github).toBe("github_repo");
    expect(SQAI_CONNECTOR_TYPE_ALIASES.postgresql).toBe("postgres");
  });

  it("registers a source with fields and schema_revision", async () => {
    const client = new SQAI({ mode: "local" });
    const source = await client.connect(ORDERS, { name: "orders" });
    expect(source.name).toBe("orders");
    expect(source.fields).toEqual(["region", "product", "revenue", "units", "order_date"]);
    expect(source.row_count).toBe(12);
    expect(source.schema_revision).toMatch(/^[0-9a-f]{64}$/);
    expect(client.listSources()).toHaveLength(1);
  });

  it("connected sources are immutable — re-binding a name to different data fails", async () => {
    const client = new SQAI({ mode: "local" });
    await client.connect(ORDERS, { name: "orders" });
    const different = [{ region: "east", other_field: 1 }];
    await expect(client.connect(different, { name: "orders" })).rejects.toMatchObject({
      code: "source_already_registered",
    });
  });

  it("re-connecting identical data under the same name is idempotent", async () => {
    const client = new SQAI({ mode: "local" });
    const first = await client.connect(ORDERS, { name: "orders" });
    const second = await client.connect(ORDERS, { name: "orders" });
    expect(second.schema_revision).toBe(first.schema_revision);
    expect(client.listSources()).toHaveLength(1);
  });

  it("enforceLimits stays OFF without an api key (constructor gotcha regression)", () => {
    const client = new SQAI({ mode: "local" });
    const raw = (client as unknown as { rawRuntime: { enforceLimits: boolean } }).rawRuntime;
    expect(raw.enforceLimits).toBe(false);
  });

  it("empty sources fail with the upstream code and no path leak", async () => {
    const client = new SQAI({ mode: "local" });
    await expect(client.connect([], { name: "empty" })).rejects.toMatchObject({
      code: "empty_source",
    });
  });

  it("delegates connector-backed connect through SQAI options", async () => {
    const connect = vi.fn().mockResolvedValue({
      source_id: "ds_1",
      dataset_id: "ds_1",
      name: "warehouse_sales",
      status: "ready",
      schema: { fields: ["revenue"], typed_fields: [{ name: "revenue", type: "number" }] },
      source_schema: {
        typed_fields: [{ name: "revenue", type: "number" }],
      },
      planner_schema_revision: "a".repeat(64),
      row_count: null,
    });
    const client = new SQAI({ mode: "deployment", runtime: { connect } as never });

    const source = await client.connect(null, {
      connector: { type: "postgres", host: "db.example.com", database: "app" },
      datasetName: "warehouse_sales",
      persist: true,
    });

    expect(connect).toHaveBeenCalledWith(null, {
      connector: { type: "postgres", host: "db.example.com", database: "app" },
      datasetName: "warehouse_sales",
      persist: true,
    });
    expect(source).toMatchObject({
      name: "warehouse_sales",
      fields: ["revenue"],
      schema_revision: "a".repeat(64),
    });
  });

  it("wraps managed connector lifecycle/test/browse methods", async () => {
    const connector = {
      id: "conn_1",
      name: "warehouse",
      connector_type: "postgres",
      status: "untested",
      visibility: "org",
    };
    const runtime = {
      connect: vi.fn(),
      createConnector: vi.fn().mockResolvedValue(connector),
      listConnectors: vi.fn().mockResolvedValue({
        connectors: [connector],
        total: 1,
        page: 1,
        limit: 25,
        pages: 1,
      }),
      getConnector: vi.fn().mockResolvedValue(connector),
      updateConnector: vi.fn().mockResolvedValue({ ...connector, name: "warehouse_live" }),
      testConnector: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
      browseConnector: vi.fn().mockResolvedValue({
        connector_type: "postgres",
        items: [{ table: "orders" }],
        total: 1,
        message: "ok",
        labels: {},
        discovery: {},
      }),
      deleteConnector: vi.fn().mockResolvedValue(undefined),
    };
    const client = new SQAI({ mode: "deployment", runtime: runtime as never });

    await expect(
      client.createConnector({
        name: "warehouse",
        connectorType: "postgres",
        config: { host: "db.example.com" },
      }),
    ).resolves.toEqual(connector);
    await expect(client.listConnectors()).resolves.toMatchObject({ total: 1 });
    await expect(client.getConnector("conn_1")).resolves.toEqual(connector);
    await expect(client.updateConnector("conn_1", { name: "warehouse_live" })).resolves.toMatchObject({
      name: "warehouse_live",
    });
    await expect(client.testConnector({ type: "postgres", host: "db.example.com" })).resolves.toMatchObject({
      success: true,
    });
    await expect(client.browseConnector("conn_1")).resolves.toMatchObject({ total: 1 });
    await client.deleteConnector("conn_1");

    expect(runtime.createConnector).toHaveBeenCalledWith({
      name: "warehouse",
      connectorType: "postgres",
      config: { host: "db.example.com" },
    });
    expect(runtime.testConnector).toHaveBeenCalledWith({ type: "postgres", host: "db.example.com" });
    expect(runtime.browseConnector).toHaveBeenCalledWith("conn_1");
    expect(runtime.deleteConnector).toHaveBeenCalledWith("conn_1");
  });

  it("fails structured when the substrate lacks managed connector wrappers", async () => {
    const client = new SQAI({ mode: "deployment", runtime: { connect: vi.fn() } as never });
    await expect(client.testConnector({ type: "postgres" })).rejects.toMatchObject({
      code: "unsupported_operation",
      details: { required: "sqai.testConnector" },
    });
  });
});
