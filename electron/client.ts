import { Cookie, CookieJar } from "tough-cookie";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  METHODS,
  requestTimeoutSeconds,
  type Route,
  type ResponseInfo,
  type CookieInfo,
  type CustomCookie,
  type Variable,
  type Header,
} from "../src/types";

import { resolveRoute } from "../src/variables";

import { customCookie } from "./custom-cookie";

export async function atomicWrite(file: string, data: unknown) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
  await rename(`${file}.tmp`, file);
}
export function validateRoute(value: Route) {
  if (
    !value ||
    typeof value.url !== "string" ||
    !METHODS.includes(value.method) ||
    typeof value.body !== "string" ||
    !Array.isArray(value.headers)
  )
    throw new Error("Invalid request.");
  requestTimeoutSeconds(value.timeoutSeconds);
  const url = new URL(value.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an http:// or https:// URL.");
  if (url.username || url.password)
    throw new Error(
      "Use an Authorization header instead of credentials in the URL.",
    );
  return url;
}
export class RestClient {
  private jar = new CookieJar();
  private active?: AbortController;
  private editingCookies = false;
  constructor(private file: string) {}
  async init() {
    try {
      this.jar = await CookieJar.deserialize(
        JSON.parse(await readFile(this.file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async cookies(): Promise<CookieInfo[]> {
    const data = await this.jar.serialize();
    const now = Date.now();
    return (data.cookies ?? [])
      .map((c) => Cookie.fromJSON(c))
      .filter((c): c is Cookie => !!c && (c.expiryTime() ?? Infinity) > now)
      .map((c) => ({
        name: c.key,
        value: c.value,
        domain: c.domain ?? "",
        path: c.path ?? "/",
        secure: c.secure,
        httpOnly: c.httpOnly,
        expires:
          (c.expiryTime() ?? Infinity) === Infinity
            ? "Session (persisted)"
            : new Date(c.expiryTime() ?? Infinity).toISOString(),
      }));
  }
  private async persist() {
    await atomicWrite(this.file, await this.jar.serialize());
  }
  async addCookie(input: CustomCookie): Promise<CookieInfo[]> {
    if (this.active || this.editingCookies)
      throw new Error(
        "Finish the current request or cookie update before adding cookies.",
      );
    this.editingCookies = true;
    try {
      const { cookie, url } = customCookie(input);
      const updated = await this.jar.clone();
      const stored = await updated.setCookie(cookie, url, {
        http: true,
        ignoreError: false,
      });
      if (!stored)
        throw new Error(
          "Cookie rejected. Check the Secure setting and cookie name prefix.",
        );
      await atomicWrite(this.file, await updated.serialize());
      this.jar = updated;
      return await this.cookies();
    } finally {
      this.editingCookies = false;
    }
  }
  async clear() {
    if (this.active || this.editingCookies)
      throw new Error(
        "Finish the current request or cookie update before clearing cookies.",
      );
    this.editingCookies = true;
    try {
      const updated = await this.jar.clone();
      await updated.removeAllCookies();
      await atomicWrite(this.file, await updated.serialize());
      this.jar = updated;
    } finally {
      this.editingCookies = false;
    }
  }
  cancel() {
    this.active?.abort(new Error("Request cancelled."));
  }
  async execute(
    route: Route,
    variables: Variable[] = [],
    globalHeaders: Header[] = [],
  ): Promise<ResponseInfo> {
    if (this.active) throw new Error("A request is already running.");
    if (this.editingCookies)
      throw new Error("Wait for the cookie update to finish before sending.");
    route = resolveRoute(route, variables, globalHeaders);
    let url = validateRoute(route);
    const timeoutSeconds = requestTimeoutSeconds(route.timeoutSeconds);
    const controller = new AbortController();
    this.active = controller;
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(`Request timed out after ${timeoutSeconds} seconds.`),
        ),
      timeoutSeconds * 1000,
    );
    const start = performance.now();
    try {
      let method: string = route.method;
      let body: string | undefined = ["GET", "HEAD"].includes(method)
        ? undefined
        : route.body || undefined;
      const headers = new Headers();
      for (const h of route.headers) {
        if (!h.enabled || !h.name.trim()) continue;
        if (
          ["cookie", "host", "content-length"].includes(
            h.name.trim().toLowerCase(),
          )
        )
          throw new Error(`${h.name} is managed automatically.`);
        headers.append(h.name.trim(), h.value);
      }
      for (let hop = 0; hop <= 10; hop++) {
        const cookie = await this.jar.getCookieString(url.href);
        headers.delete("cookie");
        if (cookie) headers.set("cookie", cookie);
        const response = await fetch(url, {
          method,
          headers,
          body,
          redirect: "manual",
          signal: controller.signal,
        });
        for (const value of response.headers.getSetCookie())
          await this.jar.setCookie(value, url.href, { ignoreError: true });
        await this.persist();
        const location = response.headers.get("location");
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          await response.body?.cancel();
          if (hop === 10) throw new Error("Too many redirects (maximum 10).");
          const next = new URL(location, url);
          if (
            !["http:", "https:"].includes(next.protocol) ||
            next.username ||
            next.password
          )
            throw new Error("Unsupported redirect URL.");
          if (next.origin !== url.origin) {
            headers.delete("authorization");
            headers.delete("proxy-authorization");
          }
          if (
            (response.status === 303 && method !== "HEAD") ||
            ([301, 302].includes(response.status) && method === "POST")
          ) {
            method = "GET";
            body = undefined;
            headers.delete("content-type");
            headers.delete("content-length");
          }
          url = next;
          continue;
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        let truncated = false;
        const reader = response.body?.getReader();
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const remaining = 5 * 1024 * 1024 - size;
            chunks.push(value.subarray(0, remaining));
            size += Math.min(value.length, remaining);
            if (value.length > remaining) {
              truncated = true;
              await reader.cancel();
              break;
            }
          }
        return {
          status: response.status,
          statusText: response.statusText,
          url: url.href,
          headers: Array.from(response.headers.entries()),
          body: Buffer.concat(chunks).toString("utf8"),
          duration: Math.round(performance.now() - start),
          size,
          truncated,
        };
      }
      throw new Error("Too many redirects.");
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
      this.active = undefined;
    }
  }
}
