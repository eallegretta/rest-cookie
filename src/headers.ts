import type { Header } from "./types";

export function validateHeaders(value: unknown): asserts value is Header[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some(
      (h) =>
        !h ||
        typeof h.id !== "string" ||
        typeof h.name !== "string" ||
        typeof h.value !== "string" ||
        typeof h.enabled !== "boolean",
    )
  ) {
    throw new Error(
      "Invalid headers. Each header needs a name, value, and enabled setting.",
    );
  }
}
