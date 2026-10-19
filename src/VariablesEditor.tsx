import { useState } from "react";
import type { Environment, Variable } from "./types";
import { DEFAULT_ENVIRONMENT_ID, validateEnvironments } from "./environments";

export function VariablesEditor({
  environments,
  environmentId,
  onSave,
  onClose,
}: {
  environments: Environment[];
  environmentId: string;
  onSave: (environments: Environment[], selectedId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(environments));
  const [selectedId, setSelectedId] = useState(environmentId);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = draft.find((e) => e.id === selectedId)!;
  const isDefault = selectedId === DEFAULT_ENVIRONMENT_ID;
  const inherited = isDefault
    ? []
    : draft
        .find((e) => e.id === DEFAULT_ENVIRONMENT_ID)!
        .variables.filter(
          (v) =>
            !selected.variables.some((override) => override.name === v.name),
        );
  const updateVariables = (update: (variables: Variable[]) => Variable[]) => {
    setDraft((rows) =>
      rows.map((env) =>
        env.id === selectedId
          ? { ...env, variables: update(env.variables) }
          : env,
      ),
    );
    setError("");
  };
  const update = (index: number, field: keyof Variable, value: string) =>
    updateVariables((rows) =>
      rows.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  function addEnvironment() {
    const name = newName.trim();
    if (!name) {
      setError("Enter an environment name.");
      return;
    }
    if (draft.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      setError("Environment names must be unique.");
      return;
    }
    const id = crypto.randomUUID();
    setDraft((rows) => [...rows, { id, name, variables: [] }]);
    setSelectedId(id);
    setNewName("");
    setError("");
  }
  async function save() {
    setSaving(true);
    try {
      const normalized = draft.map((e) => ({ ...e, name: e.name.trim() }));
      validateEnvironments(normalized);
      await onSave(normalized, selectedId);
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
        aria-label="Variables"
      >
        <div className="eyebrow">WORKSPACE SETTINGS</div>
        <h2>Environments & variables</h2>
        <p>
          Use <code>{"${VAR_NAME}"}</code> in URLs, headers, and bodies. Each
          environment inherits Default values unless you override them.
        </p>
        <div className="environment-controls">
          <label>
            Edit environment
            <select
              aria-label="Edit environment"
              disabled={saving}
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setError("");
              }}
            >
              {draft.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name || "Unnamed environment"}
                </option>
              ))}
            </select>
          </label>
          {!isDefault && (
            <>
              <label>
                Environment name
                <input
                  aria-label="Environment name"
                  disabled={saving}
                  value={selected.name}
                  onChange={(e) =>
                    setDraft((rows) =>
                      rows.map((env) =>
                        env.id === selectedId
                          ? { ...env, name: e.target.value }
                          : env,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="danger"
                disabled={saving}
                onClick={() => {
                  setDraft((rows) =>
                    rows.filter((env) => env.id !== selectedId),
                  );
                  setSelectedId(DEFAULT_ENVIRONMENT_ID);
                  setError("");
                }}
              >
                Delete environment
              </button>
            </>
          )}
        </div>
        <div className="create-environment">
          <input
            aria-label="New environment name"
            placeholder="New environment name, e.g. Staging"
            disabled={saving}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button disabled={saving} onClick={addEnvironment}>
            Add environment
          </button>
        </div>
        <div className="variables-list">
          <div className="variable-row variable-labels">
            <span>NAME</span>
            <span>{isDefault ? "DEFAULT VALUE" : "OVERRIDE VALUE"}</span>
            <span />
          </div>
          {selected.variables.map((v, index) => (
            <div className="variable-row" key={index}>
              <input
                aria-label={`Variable name ${index + 1}`}
                placeholder="BASE_URL"
                value={v.name}
                disabled={saving}
                spellCheck={false}
                onChange={(e) => update(index, "name", e.target.value)}
              />
              <input
                aria-label={`Variable value ${index + 1}`}
                placeholder="https://api.example.com"
                value={v.value}
                disabled={saving}
                spellCheck={false}
                onChange={(e) => update(index, "value", e.target.value)}
              />
              <button
                className="icon"
                aria-label={`Remove variable ${index + 1}`}
                title={
                  isDefault
                    ? "Remove variable"
                    : "Remove override; use Default if available"
                }
                disabled={saving}
                onClick={() =>
                  updateVariables((rows) => rows.filter((_, i) => i !== index))
                }
              >
                ×
              </button>
            </div>
          ))}
          {inherited.length > 0 && (
            <div className="inherited-label">INHERITED FROM DEFAULT</div>
          )}
          {inherited.map((v) => (
            <div className="inherited-row" key={v.name}>
              <code>{v.name}</code>
              <code>{v.value || "(empty)"}</code>
              <button
                disabled={saving}
                aria-label={`Override ${v.name}`}
                onClick={() => updateVariables((rows) => [...rows, { ...v }])}
              >
                Override
              </button>
            </div>
          ))}
          {!selected.variables.length && !inherited.length && (
            <p>
              No variables yet. Add BASE_URL to reuse an API address across
              routes.
            </p>
          )}
        </div>
        <button
          className="add-header"
          disabled={saving}
          onClick={() =>
            updateVariables((rows) => [...rows, { name: "", value: "" }])
          }
        >
          ＋ Add variable
        </button>
        <p className="hint">
          {!isDefault &&
            "Remove an override to use Default again. An empty value overrides Default with an empty string. "}
          Names are case-sensitive. Values are inserted literally and stored in
          plaintext.
        </p>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="send" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save variables"}
          </button>
        </div>
      </section>
    </div>
  );
}
