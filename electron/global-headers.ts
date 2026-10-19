import { readFile } from "node:fs/promises";
import { atomicWrite } from "./client";
import { validateHeaders } from "../src/headers";
import type { Header } from "../src/types";

export class GlobalHeadersStore {
  private headers: Header[] = [];
  private writes: Promise<void> = Promise.resolve();
  constructor(private file: string) {}
  async init() {
    try {
      const stored: unknown = JSON.parse(await readFile(this.file, "utf8"));
      validateHeaders(stored);
      this.headers = stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  list(): Header[] {
    return structuredClone(this.headers);
  }
  async save(value: unknown) {
    validateHeaders(value);
    const snapshot = structuredClone(value);
    const write = this.writes.then(async () => {
      await atomicWrite(this.file, snapshot);
      this.headers = snapshot;
    });
    this.writes = write.catch(() => {});
    await write;
  }
}
