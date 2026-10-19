import { useState } from "react";
import type { CustomCookie } from "./types";

export function CustomCookieForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (cookie: CustomCookie) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [domain, setDomain] = useState("");
  const [expiration, setExpiration] = useState("");
  const [httpOnly, setHttpOnly] = useState(false);
  const [secure, setSecure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const date = expiration ? new Date(expiration) : null;
      if (
        date &&
        (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      )
        throw new Error("Expiration must be a valid date in the future.");
      await onAdd({
        name,
        value,
        domain,
        expires: date ? date.toISOString() : null,
        httpOnly,
        secure,
      });
      setName("");
      setValue("");
      setNotice("Cookie saved.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : String(e),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="custom-cookie">
      <summary>Add custom cookie</summary>
      <form onSubmit={submit}>
        <fieldset disabled={disabled || saving}>
          <div className="cookie-fields">
            <label>
              Name
              <input
                aria-label="Cookie name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="session"
                spellCheck={false}
              />
            </label>
            <label>
              Value
              <input
                aria-label="Cookie value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Cookie value (may be empty)"
                spellCheck={false}
              />
            </label>
            <label>
              Domain
              <input
                aria-label="Cookie domain"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com or localhost"
                spellCheck={false}
              />
            </label>
            <label>
              Expiration date (local time)
              <input
                aria-label="Cookie expiration date"
                type="datetime-local"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
              />
            </label>
          </div>
          <div className="cookie-flags">
            <label>
              <input
                type="checkbox"
                checked={httpOnly}
                onChange={(e) => setHttpOnly(e.target.checked)}
              />{" "}
              HttpOnly
            </label>
            <label>
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
              />{" "}
              Secure (HTTPS only)
            </label>
          </div>
          <p className="hint">
            Leave expiration blank for a session cookie (persisted across
            restarts). Path is /. Saving the same name and domain replaces the
            existing / cookie. Domain cookies also apply to subdomains.
          </p>
          <button className="send" type="submit">
            {saving ? "Saving…" : "Save cookie"}
          </button>
        </fieldset>
        {disabled && (
          <p className="hint">
            Finish or cancel the request before adding cookies.
          </p>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
      </form>
    </details>
  );
}
