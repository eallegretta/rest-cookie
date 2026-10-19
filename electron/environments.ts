import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "./client";
import { defaultEnvironments, validateEnvironments } from "../src/environments";
import { validateVariables } from "../src/variables";
import type { Environment } from "../src/types";

export class EnvironmentStore {
  private environments = defaultEnvironments();
  private writes: Promise<void> = Promise.resolve();
  constructor(private directory: string) {}
  async init() {
    try {
      const stored: unknown = JSON.parse(
        await readFile(join(this.directory, "environments.json"), "utf8"),
      );
      validateEnvironments(stored);
      this.environments = stored;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Preserve existing variables as Default without overwriting the legacy file.
    try {
      const legacy: unknown = JSON.parse(
        await readFile(join(this.directory, "variables.json"), "utf8"),
      );
      validateVariables(legacy);
      this.environments = defaultEnvironments(legacy);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.save(this.environments);
  }
  list(): Environment[] {
    return structuredClone(this.environments);
  }
  async save(value: unknown) {
    validateEnvironments(value);
    const snapshot = structuredClone(value);
    const write = this.writes.then(async () => {
      await atomicWrite(join(this.directory, "environments.json"), snapshot);
      this.environments = snapshot;
    });
    this.writes = write.catch(() => {});
    await write;
  }
}
