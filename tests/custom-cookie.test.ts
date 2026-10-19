import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CookieJar } from "tough-cookie";
import { RestClient } from "../electron/client";
import type { CustomCookie, Route } from "../src/types";

const input = (patch: Partial<CustomCookie> = {}): CustomCookie => ({
  name: "session",
  value: "custom-value",
  domain: "127.0.0.1",
  expires: new Date(Date.now() + 3600_000).toISOString(),
  httpOnly: true,
  secure: false,
  ...patch,
});
test("manual cookies persist, send to matching requests, replace and obey server deletion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "manual-cookie-"));
  const server = createServer((req, res) => {
    if (req.url === "/logout")
      res.setHeader("Set-Cookie", "session=; Max-Age=0; Path=/");
    res.end(req.headers.cookie ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const file = join(dir, "cookies.json");
    const client = new RestClient(file);
    await client.init();
    const cookie = input();
    const list = await client.addCookie(cookie);
    assert.equal(list[0].name, "session");
    assert.equal(list[0].httpOnly, true);
    assert.equal(list[0].expires, cookie.expires);
    const restarted = new RestClient(file);
    await restarted.init();
    const route = (path = "/"): Route => ({
      id: "r",
      name: "r",
      method: "GET",
      url: `http://127.0.0.1:${(server.address() as { port: number }).port}${path}`,
      body: "",
      headers: [],
    });
    assert.equal(
      (await restarted.execute(route())).body,
      "session=custom-value",
    );
    await restarted.addCookie(
      input({ value: "replacement", httpOnly: false, expires: null }),
    );
    assert.equal((await restarted.cookies()).length, 1);
    assert.equal((await restarted.cookies())[0].httpOnly, false);
    assert.equal(
      (await restarted.execute(route())).body,
      "session=replacement",
    );
    await restarted.execute(route("/logout"));
    assert.deepEqual(await restarted.cookies(), []);
    await restarted.addCookie(input());
    await restarted.clear();
    assert.deepEqual(await restarted.cookies(), []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("custom domain and Secure cookies obey scope and expire", async () => {
  const dir = await mkdtemp(join(tmpdir(), "manual-cookie-scope-"));
  try {
    const file = join(dir, "cookies.json");
    const client = new RestClient(file);
    await client.init();
    await client.addCookie(
      input({ domain: ".Example.com", secure: true, expires: null }),
    );
    const jar = await CookieJar.deserialize(
      JSON.parse(await readFile(file, "utf8")),
    );
    assert.equal(
      await jar.getCookieString("https://api.example.com/"),
      "session=custom-value",
    );
    assert.equal(await jar.getCookieString("http://example.com/"), "");
    assert.equal(await jar.getCookieString("https://other.example/"), "");
    await client.addCookie(
      input({
        name: "short",
        expires: new Date(Date.now() + 500).toISOString(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.ok(!(await client.cookies()).some((c) => c.name === "short"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects invalid cookies without changing the saved jar and serializes cookie mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "manual-cookie-invalid-"));
  try {
    const file = join(dir, "cookies.json");
    const client = new RestClient(file);
    await client.init();
    await client.addCookie(input());
    const before = await readFile(file, "utf8");
    for (const patch of [
      { name: "bad name" },
      { value: "injected; Secure" },
      { value: "a\r\nb" },
      { domain: "https://example.com" },
      { domain: "localhost:3000" },
      { domain: "example.com/path" },
      { domain: "example.com?query" },
      { domain: "com" },
      { expires: "invalid" },
      { expires: "2000-01-01T00:00:00Z" },
      { name: "__Secure-token", secure: false },
    ]) {
      await assert.rejects(client.addCookie(input(patch)));
      assert.equal(await readFile(file, "utf8"), before);
    }
    const pending = client.addCookie(input({ name: "other" }));
    await assert.rejects(client.clear(), /cookie update/);
    await assert.rejects(client.addCookie(input()), /cookie update/);
    await pending;
    assert.equal((await client.cookies()).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
