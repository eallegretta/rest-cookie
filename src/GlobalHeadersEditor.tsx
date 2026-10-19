import { useState } from "react";
import type { Header } from "./types";
import { HeaderEditor } from "./HeaderEditor";

export function GlobalHeadersEditor({
  headers,
  onSave,
  onClose,
}: {
  headers: Header[];
  onSave: (headers: Header[]) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(headers));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
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
    <div className="overlay">
      <section
        className="modal variables-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Global headers"
      >
        <div className="eyebrow">WORKSPACE SETTINGS</div>
        <h2>Global headers</h2>
        <p>
          Enabled headers are included in every request. Per-request headers
          override matching global headers (names are case-insensitive).
        </p>
        <p>
          Use <code>{"${VAR_NAME}"}</code> for values from the selected
          environment.
        </p>
        <div className="variables-list">
          <HeaderEditor headers={draft} onChange={setDraft} disabled={saving} />
        </div>
        <p className="hint">
          Cookie, Host, and Content-Length are managed automatically. Headers
          are saved on this device in plaintext.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="send" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save global headers"}
          </button>
        </div>
      </section>
    </div>
  );
}
