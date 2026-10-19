import type { Route, Variable, Header } from "./types";

import { validateHeaders } from "./headers";

const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateVariables(value: unknown): asserts value is Variable[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid variables list.");
  const names = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item.name !== "string" ||
      !variableName.test(item.name) ||
      typeof item.value !== "string"
    ) {
      throw new Error(
        "Variable names must start with a letter or underscore and contain only letters, numbers, and underscores.",
      );
    }
    if (names.has(item.name))
      throw new Error(`Duplicate variable: ${item.name}`);
    names.add(item.name);
  }
}

/** Resolve once, without modifying the saved template or evaluating code. */
export function resolveRoute(
  route: Route,
  variables: Variable[],
  globalHeaders: Header[] = [],
): Route {
  validateVariables(variables);
  validateHeaders(route.headers);
  validateHeaders(globalHeaders);
  const values = new Map(variables.map((v) => [v.name, v.value]));
  const missing = new Set<string>();
  const replace = (text: string) =>
    text.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (placeholder, name: string) => {
        if (!values.has(name)) {
          missing.add(name);
          return placeholder;
        }
        return values.get(name)!;
      },
    );
  const url = replace(route.url);
  const resolveNames = (headers: Header[]) =>
    headers.map((h) =>
      h.enabled && h.name.trim()
        ? { ...h, name: replace(h.name).trim() }
        : { ...h },
    );
  const requestHeaders = resolveNames(route.headers);
  const requestNames = new Set(
    requestHeaders
      .filter((h) => h.enabled && h.name.trim())
      .map((h) => h.name.trim().toLowerCase()),
  );
  const inherited = resolveNames(globalHeaders).filter(
    (h) =>
      h.enabled &&
      h.name.trim() &&
      !requestNames.has(h.name.trim().toLowerCase()),
  );
  const resolved = {
    ...route,
    url,
    headers: [...inherited, ...requestHeaders].map((h) =>
      h.enabled && h.name.trim() ? { ...h, value: replace(h.value) } : h,
    ),
    body: ["GET", "HEAD"].includes(route.method)
      ? route.body
      : replace(route.body),
  };
  if (missing.size)
    throw new Error(
      `Undefined variables: ${[...missing].join(", ")}. Add them in Variables before sending.`,
    );
  return resolved;
}
