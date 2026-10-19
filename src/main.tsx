import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  METHODS,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  requestTimeoutSeconds,
  type Route,
  type ResponseInfo,
  type CookieInfo,
  type Environment,
  type Header,
} from "./types";
import "./styles.css";
import {
  DEFAULT_ENVIRONMENT_ID,
  defaultEnvironments,
  environmentVariables,
} from "./environments";
import { VariablesEditor } from "./VariablesEditor";
import { HeaderEditor } from "./HeaderEditor";
import { GlobalHeadersEditor } from "./GlobalHeadersEditor";
import { CustomCookieForm } from "./CustomCookieForm";
const uid = () => crypto.randomUUID();
const blank = (): Route => ({
  id: uid(),
  name: "Untitled request",
  method: "GET",
  url: "",
  headers: [],
  body: "",
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
});
const message = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : String(e);
function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [draft, setDraft] = useState<Route>(blank);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [requestTab, setRequestTab] = useState("headers");
  const [responseTab, setResponseTab] = useState("body");
  const [response, setResponse] = useState<ResponseInfo | null>(null);
  const [cookies, setCookies] = useState<CookieInfo[]>([]);
  const [showCookies, setShowCookies] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "clear" | null>(null);
  const [pending, setPending] = useState<Route | null>(null);
  const [pretty, setPretty] = useState(true);
  const [environments, setEnvironments] =
    useState<Environment[]>(defaultEnvironments);
  const [environmentId, setEnvironmentId] = useState(DEFAULT_ENVIRONMENT_ID);
  const variables = environmentVariables(environments, environmentId);
  const [globalHeaders, setGlobalHeaders] = useState<Header[]>([]);
  const [showGlobalHeaders, setShowGlobalHeaders] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  useEffect(() => {
    Promise.all([
      window.api.loadRoutes(),
      window.api.cookies(),
      window.api.loadEnvironments(),
      window.api.loadGlobalHeaders(),
    ])
      .then(([saved, jar, savedEnvironments, savedGlobalHeaders]) => {
        setGlobalHeaders(savedGlobalHeaders);
        setEnvironments(savedEnvironments);
        setRoutes(saved);
        setCookies(jar);
        if (saved[0]) setDraft(saved[0]);
        setLoaded(true);
      })
      .catch((e) => setError(message(e)));
  }, []);
  const saved = routes.find((r) => r.id === draft.id);
  const dirty = saved
    ? JSON.stringify(saved) !== JSON.stringify(draft)
    : !!(
        draft.url ||
        draft.body ||
        draft.headers.length ||
        (draft.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) !==
          DEFAULT_TIMEOUT_SECONDS ||
        draft.name !== "Untitled request"
      );
  const patch = (value: Partial<Route>) => {
    setDraft((r) => ({ ...r, ...value }));
    setNotice("");
  };
  const switchRoute = (route: Route) => {
    if (dirty) {
      setPending(route);
      return;
    }
    select(route);
  };
  function select(route: Route) {
    setDraft(route);
    setResponse(null);
    setError("");
    setNotice("");
    setPending(null);
  }
  async function persist(next: Route[]) {
    setSaving(true);
    try {
      await window.api.saveRoutes(next);
      setRoutes(next);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    if (!draft.name.trim()) {
      setError("Give this route a name.");
      return;
    }
    try {
      requestTimeoutSeconds(draft.timeoutSeconds);
    } catch (e) {
      setError(message(e));
      return;
    }
    const next = saved
      ? routes.map((r) => (r.id === draft.id ? draft : r))
      : [...routes, draft];
    if (await persist(next)) setNotice("Route saved");
  }
  async function send() {
    setBusy(true);
    setError("");
    setResponse(null);
    setNotice("");
    try {
      setResponse(await window.api.execute(draft, environmentId));
    } catch (e) {
      setError(message(e));
    } finally {
      try {
        setCookies(await window.api.cookies());
      } catch (e) {
        setError(message(e));
      }
      setBusy(false);
    }
  }
  async function confirmAction() {
    if (confirm === "delete") {
      const next = routes.filter((r) => r.id !== draft.id);
      if (await persist(next)) select(next[0] ?? blank());
    } else {
      try {
        await window.api.clearCookies();
        setCookies([]);
        setNotice("Cookie jar cleared");
      } catch (e) {
        setError(message(e));
      }
    }
    setConfirm(null);
  }
  let responseBody = response?.body ?? "";
  if (pretty && responseBody) {
    try {
      responseBody = JSON.stringify(JSON.parse(responseBody), null, 2);
    } catch {
      /* Plain text stays unchanged. */
    }
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="logo"
            src="./logo.png"
            alt="Cookie resting in an armchair"
          />
          <div>
            rest<span className="brand-light">cookie</span>
            <small>YOUR API WORKSPACE</small>
          </div>
        </div>
        <div className="collection-title">
          COLLECTION <span>{routes.length}</span>
          <button
            className="icon"
            title="New request"
            disabled={busy || saving || !loaded}
            onClick={() => switchRoute(blank())}
          >
            +
          </button>
        </div>
        <input
          className="search"
          aria-label="Search routes"
          placeholder="Search requests…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <nav>
          {routes
            .filter((r) =>
              `${r.name} ${r.url} ${r.method}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((r) => (
              <button
                disabled={busy || saving}
                className={`route ${r.id === draft.id ? "selected" : ""}`}
                key={r.id}
                onClick={() => switchRoute(r)}
              >
                <span className={`method ${r.method.toLowerCase()}`}>
                  {r.method}
                </span>
                <span>{r.name}</span>
              </button>
            ))}
          {!routes.length && (
            <div className="sidebar-empty">
              A home for your endpoints.
              <br />
              Save your first request to get started.
            </div>
          )}
        </nav>
        <button
          className="new-route"
          disabled={busy || saving || !loaded}
          onClick={() => switchRoute(blank())}
        >
          ＋ New request
        </button>
        <div className="sidebar-bottom">
          <span className="dot" /> Local workspace
          <small>Routes & cookies saved on this device</small>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{draft.name}</b>
            {dirty && <span className="unsaved">Unsaved</span>}
          </div>
          <div className="header-actions">
            <button
              className="jar-button"
              disabled={!loaded || busy}
              onClick={() => setShowGlobalHeaders(true)}
            >
              Global headers{" "}
              <span>
                {globalHeaders.filter((h) => h.enabled && h.name.trim()).length}
              </span>
            </button>
            <label className="environment-picker">
              Environment
              <select
                aria-label="Environment"
                value={environmentId}
                disabled={!loaded || busy}
                onChange={(e) => {
                  setEnvironmentId(e.target.value);
                  setResponse(null);
                  setError("");
                  setNotice("");
                }}
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="jar-button"
              disabled={!loaded || busy}
              onClick={() => setShowVariables(true)}
            >
              Variables <span>{variables.length}</span>
            </button>
            <button className="jar-button" onClick={() => setShowCookies(true)}>
              ◉ Cookie jar <span>{cookies.length}</span>
            </button>
          </div>
        </header>
        <div className="workspace">
          <section className="request-heading">
            <div>
              <div className="eyebrow">REQUEST BUILDER</div>
              <label className="route-name-label" htmlFor="route-name">
                Route name
              </label>
              <input
                id="route-name"
                className="request-name"
                aria-label="Route name"
                value={draft.name}
                disabled={busy || saving}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <p>Edit the name above, then save your route.</p>
            </div>
            <div className="actions">
              {saved && (
                <button
                  className="danger subtle"
                  disabled={busy || saving}
                  onClick={() => setConfirm("delete")}
                >
                  Delete
                </button>
              )}
              <button disabled={!loaded || saving || busy} onClick={save}>
                {saving ? "Saving…" : "Save route"}
              </button>
            </div>
          </section>
          <form
            className="url-bar"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void send();
            }}
          >
            <select
              aria-label="HTTP method"
              value={draft.method}
              disabled={busy}
              onChange={(e) =>
                patch({ method: e.target.value as Route["method"] })
              }
            >
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              aria-label="Request URL"
              placeholder={"${BASE_URL}/v1/resource"}
              value={draft.url}
              disabled={busy}
              onChange={(e) => patch({ url: e.target.value })}
            />
            {busy ? (
              <button
                type="button"
                className="send"
                onClick={() =>
                  window.api.cancel().catch((e) => setError(message(e)))
                }
              >
                Cancel ■
              </button>
            ) : (
              <button className="send" disabled={!loaded || !draft.url.trim()}>
                Send request ↗
              </button>
            )}
          </form>
          <label className="timeout-setting">
            Timeout (seconds)
            <input
              type="number"
              aria-label="Request timeout (seconds)"
              min="0.001"
              max={MAX_TIMEOUT_SECONDS}
              step="any"
              value={
                Number.isNaN(draft.timeoutSeconds)
                  ? ""
                  : (draft.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)
              }
              disabled={busy || saving}
              onChange={(e) =>
                patch({ timeoutSeconds: e.target.valueAsNumber })
              }
            />
          </label>
          <div className="session-note">
            <span className="dot" /> Cookies are captured automatically and
            included in matching requests.
          </div>
          <p className="variables-hint">
            Use <code>{"${VAR_NAME}"}</code> in the URL, headers, or body.
            Manage values in Variables.
          </p>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              ✓ {notice}
            </div>
          )}
          <section className="panel request-panel">
            <div className="tabs">
              <button
                className={requestTab === "headers" ? "active" : ""}
                onClick={() => setRequestTab("headers")}
              >
                Request headers{" "}
                <span>
                  {draft.headers.filter((h) => h.enabled && h.name).length}
                </span>
              </button>
              <button
                className={requestTab === "body" ? "active" : ""}
                onClick={() => setRequestTab("body")}
              >
                Body
              </button>
              <span className="tab-hint">Request configuration</span>
            </div>
            {requestTab === "headers" ? (
              <div className="headers-editor">
                <p className="headers-scope-note">
                  These headers apply to this route and override matching global
                  headers. A disabled request header leaves its global value
                  active.
                </p>
                <HeaderEditor
                  headers={draft.headers}
                  disabled={busy}
                  onChange={(headers) => patch({ headers })}
                />
                <button
                  className="global-headers-link"
                  disabled={!loaded || busy}
                  onClick={() => setShowGlobalHeaders(true)}
                >
                  Manage global headers (
                  {
                    globalHeaders.filter((h) => h.enabled && h.name.trim())
                      .length
                  }{" "}
                  enabled)
                </button>
                <p className="hint">
                  Cookie headers are managed by your cookie jar.
                </p>
              </div>
            ) : (
              <div className="body-editor">
                <div className="body-help">
                  Raw request body{" "}
                  <span>
                    {["GET", "HEAD"].includes(draft.method)
                      ? `Body is not sent with ${draft.method}`
                      : "Set Content-Type in Headers when needed"}
                  </span>
                </div>
                <textarea
                  aria-label="Request body"
                  spellCheck={false}
                  disabled={busy || ["GET", "HEAD"].includes(draft.method)}
                  value={draft.body}
                  placeholder={'{\n  "hello": "world"\n}'}
                  onChange={(e) => patch({ body: e.target.value })}
                />
              </div>
            )}
          </section>
          <section className="panel response-panel">
            <div className="response-title">
              <h2>Response</h2>
              {response ? (
                <div className="response-meta">
                  <span
                    className={
                      response.status < 400 ? "status-ok" : "status-bad"
                    }
                  >
                    {response.status} {response.statusText}
                  </span>
                  <span>{response.duration} ms</span>
                  <span>{(response.size / 1024).toFixed(1)} KB</span>
                </div>
              ) : (
                <span className="hint">
                  {busy ? "Request in progress…" : "Ready when you are"}
                </span>
              )}
            </div>
            {response ? (
              <>
                <div className="tabs">
                  <button
                    className={responseTab === "body" ? "active" : ""}
                    onClick={() => setResponseTab("body")}
                  >
                    Body
                  </button>
                  <button
                    className={responseTab === "headers" ? "active" : ""}
                    onClick={() => setResponseTab("headers")}
                  >
                    Headers <span>{response.headers.length}</span>
                  </button>
                  {responseTab === "body" && (
                    <button
                      className="format-toggle"
                      onClick={() => setPretty(!pretty)}
                    >
                      {pretty ? "Pretty" : "Raw"} ⇄
                    </button>
                  )}
                </div>
                {response.truncated && (
                  <div className="alert">Response truncated to 5 MB.</div>
                )}
                <div className="response-url">{response.url}</div>
                {responseTab === "body" ? (
                  <pre>{responseBody || "(empty response)"}</pre>
                ) : (
                  <div className="response-headers">
                    {response.headers.map(([key, value]) => (
                      <div key={key}>
                        <b>{key}</b>
                        <code>{value}</code>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="response-empty">
                <div
                  className={busy ? "empty-symbol spinning" : "empty-symbol"}
                >
                  ↗
                </div>
                <h3>
                  {busy
                    ? "Talking to your API"
                    : "Your next response starts here"}
                </h3>
                <p>
                  {busy
                    ? "Cookies will be saved as the server returns them."
                    : "Enter an endpoint and send a request to inspect its response."}
                </p>
                <span>SHARED COOKIES. SEAMLESS SESSIONS.</span>
              </div>
            )}
          </section>
        </div>
        <footer>
          <span>
            <span className="dot" /> Cookie persistence enabled
          </span>
          <span>
            REST COOKIE <span className="version">v1.0</span>
          </span>
        </footer>
      </main>
      {showGlobalHeaders && (
        <GlobalHeadersEditor
          headers={globalHeaders}
          onClose={() => setShowGlobalHeaders(false)}
          onSave={async (next) => {
            await window.api.saveGlobalHeaders(next);
            setGlobalHeaders(next);
            setNotice("Global headers saved");
          }}
        />
      )}
      {showVariables && (
        <VariablesEditor
          environments={environments}
          environmentId={environmentId}
          onClose={() => setShowVariables(false)}
          onSave={async (next, selectedId) => {
            await window.api.saveEnvironments(next);
            setEnvironments(next);
            setEnvironmentId(selectedId);
            setResponse(null);
            setNotice("Variables saved");
          }}
        />
      )}
      {showCookies && (
        <div className="overlay" onClick={() => setShowCookies(false)}>
          <section
            className="modal cookie-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cookie jar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">
              <div>
                <div className="eyebrow">SHARED SESSION</div>
                <h2>
                  Cookie jar <span className="count">{cookies.length}</span>
                </h2>
              </div>
              <button
                aria-label="Close cookie jar"
                className="icon"
                onClick={() => setShowCookies(false)}
              >
                ×
              </button>
            </div>
            <p>
              Cookies persist across requests and app restarts. Expired and
              server-deleted cookies stop being sent automatically.
            </p>
            <CustomCookieForm
              disabled={busy}
              onAdd={async (cookie) => {
                setCookies(await window.api.addCookie(cookie));
              }}
            />
            <div className="cookie-list">
              {cookies.length ? (
                cookies.map((c, i) => (
                  <article
                    className="cookie"
                    key={`${c.domain}-${c.path}-${c.name}-${i}`}
                  >
                    <div>
                      <b>{c.name}</b>
                      <span>
                        {c.secure && "Secure · "}
                        {c.httpOnly && "HttpOnly · "}
                        {c.expires}
                      </span>
                    </div>
                    <code>{c.value}</code>
                    <small>
                      {c.domain}
                      {c.path}
                    </small>
                  </article>
                ))
              ) : (
                <div className="no-cookies">
                  Your jar is empty.
                  <br />
                  <small>
                    Add a custom cookie above or send a request that sets
                    cookies.
                  </small>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <span className="hint">
                {busy
                  ? "Finish or cancel the request to clear cookies."
                  : "Shared across all saved routes"}
              </span>
              <button
                className="danger"
                disabled={busy || !cookies.length}
                onClick={() => setConfirm("clear")}
              >
                Clear all cookies
              </button>
            </div>
          </section>
        </div>
      )}
      {(confirm || pending) && (
        <div className="overlay confirm-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm action"
          >
            <h2>
              {pending
                ? "Discard unsaved changes?"
                : confirm === "delete"
                  ? "Delete this route?"
                  : "Clear all cookies?"}
            </h2>
            <p>
              {pending
                ? "Your edits have not been saved."
                : confirm === "delete"
                  ? `“${draft.name}” will be removed from your collection.`
                  : "This removes the shared session for every route. You may need to sign in again."}
            </p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  setConfirm(null);
                  setPending(null);
                }}
              >
                Cancel
              </button>
              <button
                className="danger"
                disabled={saving}
                onClick={() =>
                  pending ? select(pending) : void confirmAction()
                }
              >
                {pending
                  ? "Discard changes"
                  : confirm === "delete"
                    ? "Delete route"
                    : "Clear cookies"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
