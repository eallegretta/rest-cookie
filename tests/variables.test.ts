import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRoute, validateVariables } from "../src/variables";
import { RestClient } from "../electron/client";
import type { Route } from "../src/types";

const template = (patch: Partial<Route> = {}): Route => ({
  id: "route",
  name: "My named route",
  method: "POST",
  url: "${BASE_URL}/items/${ITEM}?id=${ITEM}",
  headers: [
    { id: "h", enabled: true, name: "X-${HEADER}", value: "Bearer ${TOKEN}" },
  ],
  body: '{"item":"${ITEM}","literal":"${LITERAL}"}',
  ...patch,
});

test("substitutes all request fields once, preserves saved route and literal values", () => {
  const route = template();
  const original = structuredClone(route);
  const result = resolveRoute(route, [
    { name: "BASE_URL", value: "http://localhost:3000" },
    { name: "ITEM", value: "42" },
    { name: "HEADER", value: "Auth" },
    { name: "TOKEN", value: "$&$$'secret" },
    { name: "LITERAL", value: "${ITEM}" },
  ]);
  assert.equal(result.url, "http://localhost:3000/items/42?id=42");
  assert.deepEqual(result.headers[0], {
    id: "h",
    enabled: true,
    name: "X-Auth",
    value: "Bearer $&$$'secret",
  });
  assert.equal(result.body, '{"item":"42","literal":"${ITEM}"}');
  assert.equal(result.name, "My named route");
  assert.deepEqual(route, original);
});

test("rejects missing, duplicate and invalid variable names; allows empty values", () => {
  assert.throws(
    () => resolveRoute(template(), []),
    /BASE_URL, ITEM, HEADER, TOKEN, LITERAL/,
  );
  assert.throws(
    () =>
      validateVariables([
        { name: "A", value: "1" },
        { name: "A", value: "2" },
      ]),
    /Duplicate variable: A/,
  );
  for (const name of ["", "has space", "BAD-NAME", "1NAME"])
    assert.throws(
      () => validateVariables([{ name, value: "" }]),
      /Variable names/,
    );
  assert.throws(
    () => validateVariables([{ name: "A", value: 1 }]),
    /Variable names/,
  );
  assert.throws(
    () =>
      resolveRoute(template({ url: "${base_url}", headers: [], body: "" }), [
        { name: "BASE_URL", value: "http://localhost" },
      ]),
    /base_url/,
  );
  const result = resolveRoute(
    template({ url: "http://localhost/${EMPTY}", headers: [], body: "" }),
    [{ name: "EMPTY", value: "" }],
  );
  assert.equal(result.url, "http://localhost/");
});

test("ignores placeholders in disabled headers and unsent bodies", () => {
  const route = template({
    method: "GET",
    url: "http://localhost",
    headers: [
      { id: "off", enabled: false, name: "X-Test", value: "${MISSING}" },
    ],
  });
  assert.deepEqual(resolveRoute(route, []), route);
});

test("executes substituted request with cookies, and blocks undefined variables before network access", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-vars-"));
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    res.setHeader("Set-Cookie", "session=vars; Path=/; HttpOnly");
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () =>
      res.end(
        JSON.stringify({
          url: req.url,
          body,
          token: req.headers["x-auth"],
          cookie: req.headers.cookie ?? "",
        }),
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new RestClient(join(dir, "cookies.json"));
    await client.init();
    const variables = [
      {
        name: "BASE_URL",
        value: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      },
      { name: "ITEM", value: "123" },
      { name: "HEADER", value: "Auth" },
      { name: "TOKEN", value: "token" },
      { name: "LITERAL", value: "hello" },
    ];
    const first = JSON.parse(
      (await client.execute(template(), variables)).body,
    );
    assert.equal(first.url, "/items/123?id=123");
    assert.equal(first.token, "Bearer token");
    assert.equal(first.body, '{"item":"123","literal":"hello"}');
    const second = JSON.parse(
      (await client.execute(template(), variables)).body,
    );
    assert.equal(second.cookie, "session=vars");
    await assert.rejects(
      client.execute(template({ url: "${BASE_URL}/${MISSING}" }), variables),
      /Undefined variables: MISSING/,
    );
    assert.equal(calls, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
