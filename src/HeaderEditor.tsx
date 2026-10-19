import type { Header } from "./types";

export function HeaderEditor({
  headers,
  onChange,
  disabled = false,
}: {
  headers: Header[];
  onChange: (headers: Header[]) => void;
  disabled?: boolean;
}) {
  const update = (id: string, value: Partial<Header>) =>
    onChange(headers.map((h) => (h.id === id ? { ...h, ...value } : h)));
  return (
    <>
      <div className="table-label">
        <span />
        <span>KEY</span>
        <span>VALUE</span>
        <span />
      </div>
      {headers.map((h) => (
        <div className="header-row" key={h.id}>
          <input
            type="checkbox"
            aria-label={`Enable ${h.name || "header"}`}
            disabled={disabled}
            checked={h.enabled}
            onChange={(e) => update(h.id, { enabled: e.target.checked })}
          />
          <input
            aria-label="Header name"
            placeholder="Content-Type"
            disabled={disabled}
            value={h.name}
            onChange={(e) => update(h.id, { name: e.target.value })}
          />
          <input
            aria-label="Header value"
            placeholder="application/json"
            disabled={disabled}
            value={h.value}
            onChange={(e) => update(h.id, { value: e.target.value })}
          />
          <button
            className="icon"
            aria-label="Remove header"
            disabled={disabled}
            onClick={() => onChange(headers.filter((x) => x.id !== h.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="add-header"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...headers,
            { id: crypto.randomUUID(), enabled: true, name: "", value: "" },
          ])
        }
      >
        ＋ Add header
      </button>
    </>
  );
}
