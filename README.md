# Rest Cookie

A TypeScript + React + Electron REST client with saved routes and a shared persistent cookie jar.

## Run

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run build
npm start
```

On macOS, `npm start` builds and launches `restcookie.app`, so the Dock displays **restcookie**. `npm run app:mac` builds that local app without launching it (under `release/mac-arm64/` on Apple Silicon or `release/mac/` on Intel). The local bundle is ad-hoc signed, not notarized. `npm run dev` still uses the stock Electron development bundle, whose Dock label may remain Electron. Saved data continues to use the original `rest-cookie` directory.

`npm run package` creates an installer for the current platform in `release/`. Signing and notarization are not configured.

## Use

1. Choose **New request**, give it a name, select a method, and enter an HTTP or HTTPS URL. Query parameters go in the URL.
2. Add enabled headers and an optional raw body. Set `Content-Type: application/json` when sending JSON. GET and HEAD do not send a body.
3. Click **Save route** to persist it, then **Send request**. You can execute unsaved requests too.
4. Edit a saved route and save again, or use **Delete** to remove it. Switching routes prompts before discarding edits.
5. Open **Cookie jar** to inspect cookies or **Clear all cookies** to reset the shared session.

## Environments, variables, and route names

Click **Variables** in the top bar, add names and values, and click **Save variables**. Variables are shared across routes and persist across app restarts. Cancel discards all unsaved environment and variable changes.

Use the **Environment** dropdown at the top to select the values used when sending requests. **Default** is selected when the app opens. In **Variables**, use **Add environment** to create profiles such as Staging or Production. You can rename or delete custom environments; Default cannot be renamed or deleted.

Every custom environment inherits variables from Default. Click **Override** beside an inherited variable to supply an environment-specific value. Remove an override to use Default again. An empty override is an intentional empty string, not a fallback. You can also add variables that exist only in one environment. Save applies all environment changes and selects the environment you were editing. Switching environments leaves saved route templates unchanged.

Existing variables are automatically migrated into Default. Environments are saved in `environments.json`; the legacy `variables.json` file is preserved but no longer read after migration. The cookie jar continues to be shared, with normal domain/path matching.

For example, define `BASE_URL` as `https://api.example.com` and `TOKEN` as your token. Then use:

- URL: `${BASE_URL}/v1/users`
- Authorization header: `Bearer ${TOKEN}`
- Body: `{"userId":"${USER_ID}"}` (define `USER_ID` first)

Replacement happens when sending, in URLs (including query strings), enabled header names and values, and bodies for methods that send a body. The saved route keeps its placeholders. Missing variables stop the request before it reaches the network. Names are case-sensitive and must match `[A-Za-z_][A-Za-z0-9_]*`; duplicate names are rejected and empty values are allowed. Replacement is literal and single-pass: values are not evaluated, recursively expanded, URL-encoded, or JSON-escaped. Variables are app settings, not operating-system environment variables.

Use the labeled **Route name** field above the request URL to name or rename a route, then click **Save route**. That name appears in the sidebar and is saved across restarts.

## Global and per-request headers

Use **Global headers** in the top bar to add, edit, enable/disable, or remove headers shared by every request. Click **Save global headers** to persist them. Cancel discards edits. Use **Request headers** in the request editor for route-specific headers, then **Save route** to retain them.

Enabled request headers override all matching global headers, comparing names case-insensitively after variable substitution. For example, global `Authorization: Bearer ${TOKEN}` can be overridden by a request's `authorization: Bearer special-token`. Disabling a request header restores the global value. Headers that only exist globally are still sent. Multiple enabled rows with the same name within one scope retain the existing combined-header behavior.

Both scopes support `${VAR_NAME}` in names and values using the selected environment. Overridden global header values are not evaluated. Cookie, Host, and Content-Length remain automatically managed and cannot be supplied in either scope. Global headers apply to every requested host, so configure shared authentication headers accordingly.

## Custom cookies

Open **Cookie jar → Add custom cookie**. Specify its name, value, and domain (for example `example.com`, `.example.com`, `localhost`, or an IPv4 address, without a URL or port). Choose an expiration date and time in your local timezone, or leave it blank for a session cookie. Toggle **HttpOnly** as needed; **Secure** restricts sending to HTTPS. Click **Save cookie** to persist it and include it in matching requests.

Custom cookies use path `/`. Saving the same name and domain replaces the existing cookie at that path. Domain cookies also apply to subdomains. Expiration, server updates/deletion, and **Clear all cookies** apply to custom cookies too. Adding cookies is disabled while a request runs. Invalid cookie names/values, public-suffix domains, and past expiration dates are rejected.

## Cookie behavior

Every response, including redirects and HTTP error responses, updates a shared `tough-cookie` jar. Subsequent requests automatically send matching cookies according to domain, path, Secure, and expiration rules. HttpOnly cookies work. Server deletion through `Max-Age=0` or past expiration dates is honored. Cookie values may be replaced by subsequent `Set-Cookie` headers.

The jar is written after each response. Both session and persistent cookies survive app restarts; this intentionally extends browser-style session cookies for this REST client. Cookie headers cannot be manually overridden. Cookies are not sent to unrelated hosts. Cross-origin redirects strip Authorization and Proxy-Authorization headers; custom headers remain attached, so avoid placing secrets in custom headers on untrusted redirecting endpoints.

The client runs HTTP requests in Electron's main process using Node fetch, avoiding browser CORS restrictions. As a direct REST client it does not model browser top-level navigation / SameSite restrictions. HTTPS certificates are validated normally. Requests default to a 30-second timeout, configurable per route using Timeout (seconds), can be cancelled, follow at most 10 redirects, and display at most 5 MiB of UTF-8 response data. HTTP error statuses still show the response body. Binary downloads, multipart uploads, and WebSockets are not supported.

## Local data

Routes, variables, and cookies are stored as `routes.json`, `environments.json`, `global-headers.json`, and `cookies.json` in Electron's app-specific `userData` directory (on macOS normally `~/Library/Application Support/rest-cookie`). Files use owner-only permissions and atomic replacement. **Data is stored locally in plaintext**, including variable values, authentication headers, and cookie values. `REST_COOKIE_DATA_DIR` can override this directory for testing.

The renderer has no Node access, uses a narrow preload API, and cannot open external windows or navigate to response content. Response content is displayed as text.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:desktop
```

The desktop smoke test requires a graphical session and launches Electron against an isolated temporary data directory.

Integration tests run a local HTTP server and cover cookie capture and reuse, persistence across client recreation, path scope, expiration, server deletion, redirect cookies, POST bodies and headers, HTTP errors, cancellation, and clearing the jar.
