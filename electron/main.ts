import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWrite, RestClient } from "./client";
import {
  METHODS,
  requestTimeoutSeconds,
  type Route,
  type CustomCookie,
} from "../src/types";
import { environmentVariables } from "../src/environments";
import { EnvironmentStore } from "./environments";
import { GlobalHeadersStore } from "./global-headers";
// Keep the original data location when changing the visible application name.
const userDataPath = process.env.REST_COOKIE_DATA_DIR
  ? resolve(process.env.REST_COOKIE_DATA_DIR)
  : join(app.getPath("appData"), "rest-cookie");
mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.setName("restcookie");
let window: BrowserWindow | null = null;
let client: RestClient;
async function createWindow() {
  const icon = join(
    app.getAppPath(),
    app.isPackaged ? "dist/icon.png" : "public/icon.png",
  );
  if (process.platform === "darwin") app.dock?.setIcon(icon);
  window = new BrowserWindow({
    icon,
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#111416",
    title: "restcookie",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  window.on("closed", () => {
    client.cancel();
    window = null;
  });
  const url = process.env.ELECTRON_RENDERER_URL;
  if (url && !app.isPackaged) await window.loadURL(url);
  else await window.loadFile(join(__dirname, "../../dist/index.html"));
}
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
});
if (ownsLock)
  app
    .whenReady()
    .then(async () => {
      const dataDir =
        process.env.REST_COOKIE_DATA_DIR || app.getPath("userData");
      client = new RestClient(join(dataDir, "cookies.json"));
      await client.init();
      const environments = new EnvironmentStore(dataDir);
      await environments.init();
      const globalHeaders = new GlobalHeadersStore(
        join(dataDir, "global-headers.json"),
      );
      await globalHeaders.init();
      const routesFile = join(dataDir, "routes.json");
      const handle = (name: string, fn: (...args: any[]) => unknown) =>
        ipcMain.handle(name, (event, ...args) => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame
          )
            throw new Error("Untrusted sender.");
          return fn(...args);
        });
      handle("headers:load", () => globalHeaders.list());
      handle("headers:save", (next: unknown) => globalHeaders.save(next));
      handle("environments:load", () => environments.list());
      handle("environments:save", (next: unknown) => environments.save(next));
      handle("routes:load", async () => {
        try {
          return JSON.parse(await readFile(routesFile, "utf8"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      });
      handle("routes:save", async (routes: Route[]) => {
        if (
          !Array.isArray(routes) ||
          routes.length > 1000 ||
          routes.some(
            (r) =>
              !r ||
              typeof r.id !== "string" ||
              typeof r.name !== "string" ||
              typeof r.url !== "string" ||
              typeof r.body !== "string" ||
              !METHODS.includes(r.method) ||
              !Array.isArray(r.headers),
          )
        )
          throw new Error("Invalid routes.");
        for (const route of routes) requestTimeoutSeconds(route.timeoutSeconds);
        await atomicWrite(routesFile, routes);
      });
      handle("request:execute", (route: Route, environmentId: string) =>
        client.execute(
          route,
          environmentVariables(environments.list(), environmentId),
          globalHeaders.list(),
        ),
      );
      handle("request:cancel", () => client.cancel());
      handle("cookies:add", (cookie: CustomCookie) => client.addCookie(cookie));
      handle("cookies:list", () => client.cookies());
      handle("cookies:clear", () => client.clear());
      await createWindow();
      app.on("activate", () => {
        if (!window) void createWindow();
      });
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox("Rest Cookie could not start", String(error));
      app.quit();
    });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
