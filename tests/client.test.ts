import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RestClient } from "../electron/client";
import type { Route } from "../src/types";

test("persistent shared jar, server deletion, scope, redirects, clear, errors and cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-test-"));
  const server = createServer((req, res) => {
    const endpoint = req.url?.split("?")[0];
    if (endpoint === "/login")
      res.setHeader("Set-Cookie", [
        "session=abc; HttpOnly; Path=/",
        "scoped=private; Path=/private",
        "short=one; Max-Age=1; Path=/",
      ]);
    if (endpoint === "/logout")
      res.setHeader("Set-Cookie", "session=; Max-Age=0; Path=/");
    if (endpoint === "/redirect") {
      res.writeHead(302, {
        Location: "/echo",
        "Set-Cookie": "redirect=yes; Path=/",
      });
      res.end();
      return;
    }
    if (endpoint === "/slow") {
      const timer = setTimeout(() => res.end("late"), 5000);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    if (endpoint === "/error") res.statusCode = 401;
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () =>
      res.end(
        JSON.stringify({
          cookie: req.headers.cookie ?? "",
          method: req.method,
          body,
          header: req.headers["x-test"],
        }),
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const route = (path: string, extra: Partial<Route> = {}): Route => ({
    id: "test",
    name: "test",
    method: "GET",
    url: `http://127.0.0.1:${port}${path}`,
    headers: [],
    body: "",
    ...extra,
  });
  const client = new RestClient(join(dir, "cookies.json"));
  try {
    await client.init();
    await client.execute(route("/login"));
    assert.equal((await client.cookies()).length, 3);
    let result = JSON.parse((await client.execute(route("/echo"))).body);
    assert.match(result.cookie, /session=abc/);
    assert.doesNotMatch(result.cookie, /scoped=/);
    assert.match(
      JSON.parse((await client.execute(route("/private/echo"))).body).cookie,
      /scoped=private/,
    );
    const restarted = new RestClient(join(dir, "cookies.json"));
    await restarted.init();
    assert.match(
      JSON.parse((await restarted.execute(route("/echo"))).body).cookie,
      /session=abc/,
    );
    await restarted.execute(route("/logout"));
    assert.doesNotMatch(
      JSON.parse((await restarted.execute(route("/echo"))).body).cookie,
      /session=/,
    );
    const afterDelete = new RestClient(join(dir, "cookies.json"));
    await afterDelete.init();
    assert.doesNotMatch(
      JSON.parse((await afterDelete.execute(route("/echo"))).body).cookie,
      /session=/,
    );
    result = JSON.parse(
      (
        await restarted.execute(
          route("/redirect", { method: "POST", body: "test" }),
        )
      ).body,
    );
    assert.match(result.cookie, /redirect=yes/);
    assert.equal(result.method, "GET");
    assert.equal(result.body, "");
    result = JSON.parse(
      (
        await restarted.execute(
          route("/echo", {
            method: "POST",
            body: '{"a":1}',
            headers: [
              { id: "h", name: "X-Test", value: "hello", enabled: true },
            ],
          }),
        )
      ).body,
    );
    assert.equal(result.body, '{"a":1}');
    assert.equal(result.header, "hello");
    assert.equal((await restarted.execute(route("/error"))).status, 401);
    await assert.rejects(
      restarted.execute(route("/echo", { url: "file:///etc/passwd" })),
      /http/,
    );
    await assert.rejects(
      restarted.execute(
        route("/echo", {
          headers: [
            { id: "h", name: "Cookie", value: "manual=x", enabled: true },
          ],
        }),
      ),
      /automatically/,
    );
    for (const timeoutSeconds of [0, -1, NaN, Infinity, 2_147_484]) {
      await assert.rejects(
        restarted.execute(route("/echo", { timeoutSeconds })),
        /Request timeout must/,
      );
    }
    await assert.rejects(
      restarted.execute(route("/slow", { timeoutSeconds: 0.05 })),
      /Request timed out after 0.05 seconds/,
    );
    assert.equal((await restarted.execute(route("/echo"))).status, 200);
    const slow = restarted.execute(route("/slow"));
    await assert.rejects(restarted.clear(), /current request/);
    await assert.rejects(restarted.execute(route("/echo")), /already running/);
    restarted.cancel();
    await assert.rejects(slow, /cancel/i);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.doesNotMatch(
      JSON.parse((await restarted.execute(route("/echo"))).body).cookie,
      /short=/,
    );
    await restarted.clear();
    assert.deepEqual(await restarted.cookies(), []);
    const cleared = new RestClient(join(dir, "cookies.json"));
    await cleared.init();
    assert.equal(
      JSON.parse((await cleared.execute(route("/echo"))).body).cookie,
      "",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
