import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EnvironmentStore } from "../electron/environments";
import {
  defaultEnvironments,
  environmentVariables,
  validateEnvironments,
} from "../src/environments";
import { resolveRoute } from "../src/variables";
import type { Environment, Route } from "../src/types";

const profiles = (): Environment[] => [
  ...defaultEnvironments([
    { name: "BASE_URL", value: "https://default.example" },
    { name: "TOKEN", value: "default-token" },
    { name: "LIMIT", value: "10" },
  ]),
  {
    id: "staging",
    name: "Staging",
    variables: [
      { name: "BASE_URL", value: "https://staging.example" },
      { name: "TOKEN", value: "" },
      { name: "ONLY_STAGING", value: "yes" },
    ],
  },
  {
    id: "production",
    name: "Production",
    variables: [{ name: "BASE_URL", value: "https://production.example" }],
  },
];

test("selected environment overrides Default, inherits missing keys, preserves empty strings, and isolates other environments", () => {
  const envs = profiles();
  const values = Object.fromEntries(
    environmentVariables(envs, "staging").map((v) => [v.name, v.value]),
  );
  assert.deepEqual(values, {
    BASE_URL: "https://staging.example",
    TOKEN: "",
    LIMIT: "10",
    ONLY_STAGING: "yes",
  });
  const route: Route = {
    id: "r",
    name: "List",
    method: "POST",
    url: "${BASE_URL}/items?limit=${LIMIT}",
    body: "${TOKEN}",
    headers: [],
  };
  assert.equal(
    resolveRoute(route, environmentVariables(envs, "staging")).url,
    "https://staging.example/items?limit=10",
  );
  assert.equal(
    resolveRoute(route, environmentVariables(envs, "production")).body,
    "default-token",
  );
  assert.equal(
    resolveRoute(route, environmentVariables(envs, "default")).url,
    "https://default.example/items?limit=10",
  );
  assert.ok(
    !environmentVariables(envs, "production").some(
      (v) => v.name === "ONLY_STAGING",
    ),
  );
  envs[1].variables = envs[1].variables.filter((v) => v.name !== "TOKEN");
  assert.equal(
    environmentVariables(envs, "staging").find((v) => v.name === "TOKEN")!
      .value,
    "default-token",
  );
  assert.throws(
    () => environmentVariables(envs, "deleted"),
    /Environment not found/,
  );
  assert.equal(route.url, "${BASE_URL}/items?limit=${LIMIT}");
});

test("protects Default and rejects duplicate environments and invalid variables", () => {
  validateEnvironments(profiles());
  assert.throws(
    () => validateEnvironments(profiles().slice(1)),
    /cannot be deleted/,
  );
  assert.throws(
    () => validateEnvironments([{ ...profiles()[0], name: "Renamed" }]),
    /cannot be renamed/,
  );
  assert.throws(
    () =>
      validateEnvironments([
        ...profiles(),
        { id: "other", name: "STAGING", variables: [] },
      ]),
    /unique/,
  );
  assert.throws(
    () =>
      validateEnvironments([
        ...profiles(),
        { id: "staging", name: "Other", variables: [] },
      ]),
    /unique/,
  );
  assert.throws(
    () =>
      validateEnvironments([
        ...profiles(),
        { id: "other", name: " ", variables: [] },
      ]),
    /needs a name/,
  );
  assert.throws(
    () =>
      validateEnvironments([
        { ...profiles()[0], variables: [{ name: "bad-name", value: "x" }] },
      ]),
    /Variable names/,
  );
});

test("migrates legacy variables into Default, persists edits/deletions, and does not reimport stale legacy data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-env-"));
  try {
    const legacy = [{ name: "BASE_URL", value: "https://legacy.example" }];
    await writeFile(join(dir, "variables.json"), JSON.stringify(legacy));
    const store = new EnvironmentStore(dir);
    await store.init();
    assert.deepEqual(store.list(), defaultEnvironments(legacy));
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "variables.json"), "utf8")),
      legacy,
    );
    await store.save(profiles());
    const restarted = new EnvironmentStore(dir);
    await restarted.init();
    assert.deepEqual(restarted.list(), profiles());
    const snapshot = restarted.list();
    snapshot[0].variables[0].value = "modified externally";
    assert.notEqual(
      restarted.list()[0].variables[0].value,
      "modified externally",
    );
    await restarted.save(defaultEnvironments());
    const cleared = new EnvironmentStore(dir);
    await cleared.init();
    assert.deepEqual(cleared.list(), defaultEnvironments());
    await assert.rejects(cleared.save([]), /between 1 and 100/);
    assert.deepEqual(cleared.list(), defaultEnvironments());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fresh workspace starts with Default; corrupt storage is not silently replaced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-new-env-"));
  try {
    const store = new EnvironmentStore(dir);
    await store.init();
    assert.deepEqual(store.list(), defaultEnvironments());
    await writeFile(join(dir, "environments.json"), "invalid json");
    await assert.rejects(new EnvironmentStore(dir).init(), SyntaxError);
    assert.equal(
      await readFile(join(dir, "environments.json"), "utf8"),
      "invalid json",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
