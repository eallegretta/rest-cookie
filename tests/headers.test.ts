import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalHeadersStore } from "../electron/global-headers";
import { RestClient } from "../electron/client";
import { resolveRoute } from "../src/variables";
import { environmentVariables, defaultEnvironments } from "../src/environments";
import type { Header, Route } from "../src/types";

const h = (name: string, value: string, enabled = true): Header => ({
  id: name,
  name,
  value,
  enabled,
});
const route = (headers: Header[] = []): Route => ({
  id: "r",
  name: "Headers",
  method: "GET",
  url: "http://localhost",
  body: "",
  headers,
});

test("request headers override global headers after name substitution, without resolving unused global values", () => {
  const globals = [
    h("Authorization", "Bearer ${UNDEFINED}"),
    h("X-${HEADER}", "global"),
    h("Accept", "application/json"),
    h("X-Disabled", "${MISSING}", false),
  ];
  const request = route([
    h("authorization", "Bearer request"),
    h("x-tenant", "local"),
    h("accept", "text/plain", false),
  ]);
  const before = structuredClone({ globals, request });
  const result = resolveRoute(
    request,
    [{ name: "HEADER", value: "Tenant" }],
    globals,
  );
  const enabled = result.headers.filter((x) => x.enabled);
  assert.deepEqual(
    enabled.map((x) => [x.name, x.value]),
    [
      ["Accept", "application/json"],
      ["authorization", "Bearer request"],
      ["x-tenant", "local"],
    ],
  );
  assert.deepEqual({ globals, request }, before);
  assert.throws(
    () => resolveRoute(route(), [], globals),
    /Undefined variables/,
  );
});

test("global headers persist, support disabling/deleting, and reject malformed settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-headers-"));
  try {
    const file = join(dir, "global-headers.json");
    const store = new GlobalHeadersStore(file);
    await store.init();
    assert.deepEqual(store.list(), []);
    const headers = [h("Accept", "application/json"), h("X-Off", "off", false)];
    await store.save(headers);
    const restored = new GlobalHeadersStore(file);
    await restored.init();
    assert.deepEqual(restored.list(), headers);
    await assert.rejects(
      restored.save([{ name: "X", value: 123 }]),
      /Invalid headers/,
    );
    assert.deepEqual(restored.list(), headers);
    await restored.save([]);
    const empty = new GlobalHeadersStore(file);
    await empty.init();
    assert.deepEqual(empty.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("server receives global defaults, environment values, request overrides, and managed cookies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-header-http-"));
  const server = createServer((req, res) => {
    res.setHeader("Set-Cookie", "session=header-test; Path=/");
    res.end(JSON.stringify(req.headers));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new RestClient(join(dir, "cookies.json"));
    await client.init();
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const globals = [
      h("Authorization", "Bearer ${TOKEN}"),
      h("X-Shared", "all"),
      h("X-Off", "off", false),
    ];
    const environments = [
      ...defaultEnvironments([{ name: "TOKEN", value: "default-token" }]),
      {
        id: "staging",
        name: "Staging",
        variables: [{ name: "TOKEN", value: "staging-token" }],
      },
    ];
    let response = JSON.parse(
      (
        await client.execute(
          { ...route(), url },
          environmentVariables(environments, "staging"),
          globals,
        )
      ).body,
    );
    assert.equal(response.authorization, "Bearer staging-token");
    assert.equal(response["x-shared"], "all");
    assert.equal(response["x-off"], undefined);
    response = JSON.parse(
      (
        await client.execute(
          { ...route([h("AUTHORIZATION", "Bearer local")]), url },
          [],
          globals,
        )
      ).body,
    );
    assert.equal(response.authorization, "Bearer local");
    assert.equal(response.cookie, "session=header-test");
    response = JSON.parse(
      (
        await client.execute(
          { ...route([h("authorization", "ignored", false)]), url },
          environmentVariables(environments, "default"),
          globals,
        )
      ).body,
    );
    assert.equal(response.authorization, "Bearer default-token");
    await assert.rejects(
      client.execute({ ...route(), url }, [], [h("Cookie", "manual=x")]),
      /managed automatically/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
