import { contextBridge, ipcRenderer } from "electron";
import type { Api } from "../src/types";
const api: Api = {
  loadGlobalHeaders: () => ipcRenderer.invoke("headers:load"),
  saveGlobalHeaders: (headers) => ipcRenderer.invoke("headers:save", headers),
  loadEnvironments: () => ipcRenderer.invoke("environments:load"),
  saveEnvironments: (environments) =>
    ipcRenderer.invoke("environments:save", environments),
  loadRoutes: () => ipcRenderer.invoke("routes:load"),
  saveRoutes: (routes) => ipcRenderer.invoke("routes:save", routes),
  execute: (route, environmentId) =>
    ipcRenderer.invoke("request:execute", route, environmentId),
  cancel: () => ipcRenderer.invoke("request:cancel"),
  addCookie: (cookie) => ipcRenderer.invoke("cookies:add", cookie),
  cookies: () => ipcRenderer.invoke("cookies:list"),
  clearCookies: () => ipcRenderer.invoke("cookies:clear"),
};
contextBridge.exposeInMainWorld("api", api);
