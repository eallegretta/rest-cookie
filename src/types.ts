export const DEFAULT_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 2_147_483;

export function requestTimeoutSeconds(value: number | undefined): number {
  const seconds = value === undefined ? DEFAULT_TIMEOUT_SECONDS : value;
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > MAX_TIMEOUT_SECONDS
  )
    throw new Error(
      `Request timeout must be greater than 0 and at most ${MAX_TIMEOUT_SECONDS} seconds.`,
    );
  return seconds;
}

export const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export interface Header {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
}
export interface Route {
  id: string;
  name: string;
  method: (typeof METHODS)[number];
  url: string;
  headers: Header[];
  body: string;
  timeoutSeconds?: number;
}
export interface Variable {
  name: string;
  value: string;
}
export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
}
export interface CustomCookie {
  name: string;
  value: string;
  domain: string;
  expires: string | null;
  httpOnly: boolean;
  secure: boolean;
}
export interface CookieInfo {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: string;
}
export interface ResponseInfo {
  status: number;
  statusText: string;
  url: string;
  headers: [string, string][];
  body: string;
  duration: number;
  size: number;
  truncated: boolean;
}
export interface Api {
  loadGlobalHeaders(): Promise<Header[]>;
  saveGlobalHeaders(headers: Header[]): Promise<void>;
  loadEnvironments(): Promise<Environment[]>;
  saveEnvironments(environments: Environment[]): Promise<void>;
  loadRoutes(): Promise<Route[]>;
  saveRoutes(routes: Route[]): Promise<void>;
  execute(route: Route, environmentId: string): Promise<ResponseInfo>;
  cookies(): Promise<CookieInfo[]>;
  addCookie(cookie: CustomCookie): Promise<CookieInfo[]>;
  clearCookies(): Promise<void>;
  cancel(): Promise<void>;
}
declare global {
  interface Window {
    api: Api;
  }
}
