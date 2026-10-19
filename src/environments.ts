import type { Environment, Variable } from "./types";
import { validateVariables } from "./variables";

export const DEFAULT_ENVIRONMENT_ID = "default";
export const defaultEnvironments = (
  variables: Variable[] = [],
): Environment[] => [
  { id: DEFAULT_ENVIRONMENT_ID, name: "Default", variables },
];

export function validateEnvironments(
  value: unknown,
): asserts value is Environment[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error("Provide between 1 and 100 environments.");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const env of value) {
    if (
      !env ||
      typeof env.id !== "string" ||
      !env.id ||
      typeof env.name !== "string" ||
      !env.name.trim() ||
      env.name !== env.name.trim()
    )
      throw new Error(
        "Every environment needs a name without leading or trailing spaces.",
      );
    if (ids.has(env.id) || names.has(env.name.toLowerCase()))
      throw new Error("Environment names and IDs must be unique.");
    if (env.id === DEFAULT_ENVIRONMENT_ID && env.name !== "Default")
      throw new Error("The Default environment cannot be renamed.");
    validateVariables(env.variables);
    ids.add(env.id);
    names.add(env.name.toLowerCase());
  }
  if (!ids.has(DEFAULT_ENVIRONMENT_ID))
    throw new Error("The Default environment cannot be deleted.");
}

export function environmentVariables(
  environments: Environment[],
  id: string,
): Variable[] {
  const defaults = environments.find((e) => e.id === DEFAULT_ENVIRONMENT_ID);
  const selected = environments.find((e) => e.id === id);
  if (!defaults || !selected)
    throw new Error(
      "Environment not found. Select an existing environment before sending.",
    );
  const values = new Map(defaults.variables.map((v) => [v.name, v.value]));
  for (const variable of selected.variables)
    values.set(variable.name, variable.value);
  return [...values].map(([name, value]) => ({ name, value }));
}
