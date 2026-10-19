import { Cookie } from "tough-cookie";
import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import type { CustomCookie } from "../src/types";

export function customCookie(input: CustomCookie): {
  cookie: Cookie;
  url: string;
} {
  if (
    !input ||
    typeof input.name !== "string" ||
    !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(input.name)
  )
    throw new Error("Enter a valid cookie name without spaces or separators.");
  if (
    typeof input.value !== "string" ||
    !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(input.value)
  )
    throw new Error(
      "Cookie values cannot contain spaces, quotes, semicolons, backslashes, or control characters. Encode these characters first.",
    );
  if (
    typeof input.domain !== "string" ||
    typeof input.httpOnly !== "boolean" ||
    typeof input.secure !== "boolean"
  )
    throw new Error("Invalid cookie settings.");
  const rawDomain = input.domain.trim().replace(/^\./, "").toLowerCase();
  const domain = domainToASCII(rawDomain);
  if (
    /[\s/\\:@?#%]/.test(rawDomain) ||
    !domain ||
    domain.length > 253 ||
    (!isIP(domain) &&
      !domain
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
  )
    throw new Error(
      "Enter a domain or IP address without a URL, port, or path (for example, example.com or localhost).",
    );
  let expires: Date | "Infinity" = "Infinity";
  if (input.expires !== null) {
    if (typeof input.expires !== "string")
      throw new Error("Enter a valid expiration date.");
    expires = new Date(input.expires);
    if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now())
      throw new Error("Expiration must be a valid date in the future.");
  }
  const cookie = new Cookie({
    key: input.name,
    value: input.value,
    domain:
      isIP(domain) || domain === "localhost" || input.name.startsWith("__Host-")
        ? undefined
        : domain,
    path: "/",
    expires,
    httpOnly: input.httpOnly,
    secure: input.secure,
  });
  // Public suffix and domain rules are additionally enforced by CookieJar.setCookie.
  return { cookie, url: `${input.secure ? "https" : "http"}://${domain}/` };
}
