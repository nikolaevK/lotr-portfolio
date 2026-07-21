"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ENTITIES, type EntityDef, type FieldDef, type Row } from "@/admin/entities";

/**
 * The Steward's Desk — admin for every piece of information across the map.
 * Email + password (created on first run with the setup token) → session cookie
 * → CRUD over the whitelisted entities in src/admin/entities.ts.
 *
 * The game's globals.css disables body scrolling, so the shell is a fixed
 * 100vh column and every pane (nav, main, tables) scrolls itself.
 */

const GOLD = "#c9963c";
const PARCH = "#e8dcc0";
const PANEL = "rgba(24,16,7,.92)";
const PANEL_SOLID = "#241708";
const BORDER = "1px solid #4a3a18";

const inputStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 16, // ≥16px: iOS Safari auto-zooms the page on focus below that
  padding: "9px 11px",
  background: "rgba(255,252,240,.07)",
  border: "1px solid #6b5327",
  borderRadius: 2,
  color: PARCH,
  width: "100%",
};

const btnStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: ".1em",
  padding: "9px 16px",
  background: "#3d2b10",
  color: "#ecd9a0",
  border: `1px solid ${GOLD}`,
  cursor: "pointer",
  borderRadius: 2,
};

/** Phone-sized viewport (tracks rotation) — the sidebar becomes a select bar. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 820px)");
    const upd = () => setCompact(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  return compact;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}

/** rows of every entity referenced by this entity's fields, keyed by entity name */
type RefData = Record<string, Row[]>;

const refEntities = (def: EntityDef) =>
  [...new Set(def.fields.filter((f) => f.ref).map((f) => f.ref!.entity))];

const refLabel = (f: FieldDef, refData: RefData, id: unknown): string | null => {
  if (!f.ref || id === null || id === undefined || id === "") return null;
  const target = ENTITIES[f.ref.entity];
  const row = refData[f.ref.entity]?.find((r) => String(r[target.pk]) === String(id));
  return row ? f.ref.format(row) : `#${String(id)} (missing)`;
};

// ── auth screens ─────────────────────────────────────────────────────────────

function AuthGate({ needsSetup, onDone }: { needsSetup: boolean; onDone: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/auth", {
        method: "POST",
        body: JSON.stringify(
          needsSetup
            ? { action: "setup", email, password, setupToken }
            : { action: "login", email, password },
        ),
      });
      onDone(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: "100dvh", display: "flex", padding: 20, overflowY: "auto" }}>
      <form onSubmit={submit} style={{ width: 400, maxWidth: "94vw", margin: "auto", background: PANEL, border: "2px solid #6b5327", borderRadius: 3, padding: "34px 36px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="cinzel" style={{ fontSize: 12, letterSpacing: ".22em", color: GOLD }}>THE STEWARD&apos;S DESK</div>
        <h1 className="cinzel" style={{ fontSize: 24, margin: 0, color: "#e2c682" }}>
          {needsSetup ? "Claim the Keys" : "Speak, Friend, and Enter"}
        </h1>
        <p style={{ margin: 0, fontSize: 14.5, fontStyle: "italic", color: "#9c8a5e" }}>
          {needsSetup
            ? "No steward is appointed yet. Present the setup token (ADMIN_SETUP_TOKEN from the server's environment), then set the email and password that will rule this archive — a passphrase of at least 10 characters."
            : "Sign in to edit the lands, deeds and records of the realm."}
        </p>
        {needsSetup && (
          <input type="password" required autoComplete="off" placeholder="Setup token" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} style={inputStyle} />
        )}
        <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input
          type="password"
          required
          autoComplete={needsSetup ? "new-password" : "current-password"}
          placeholder={needsSetup ? "Create a password (10+ characters)" : "Password"}
          value={password}
          minLength={needsSetup ? 10 : undefined}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {needsSetup && (
          <input type="password" required autoComplete="new-password" placeholder="Repeat the password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
        )}
        {error && <div style={{ color: "#e08060", fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={busy} className="cinzel" style={{ ...btnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : needsSetup ? "APPOINT THE STEWARD" : "ENTER"}
        </button>
      </form>
    </div>
  );
}

// ── record editor form ───────────────────────────────────────────────────────

function RecordForm({
  def, initial, refData, onSave, onCancel,
}: {
  def: EntityDef;
  initial: Row | null;
  refData: RefData;
  onSave: (values: Row) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Row>(() => {
    const v: Row = {};
    if (def.manualPk && !initial) v[def.pk] = "";
    for (const f of def.fields) v[f.name] = initial?.[f.name] ?? (f.type === "bool" ? 0 : "");
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const group = def.exclusiveGroup;

  const set = (name: string, v: unknown) =>
    setValues((s) => {
      const next = { ...s, [name]: v };
      // exclusive targets: choosing one clears the others
      if (group && group.fields.includes(name) && v !== "" && v !== null) {
        for (const other of group.fields) if (other !== name) next[other] = "";
      }
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (group) {
      const setCount = group.fields.filter((f) => values[f] !== "" && values[f] !== null && values[f] !== undefined).length;
      if (setCount !== 1) {
        setError(`Pick exactly one target (${group.fields.join(" / ")}).`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setBusy(false);
    }
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "auto", background: PANEL_SOLID };

  const control = (f: FieldDef) => {
    const val = values[f.name];
    if (f.ref) {
      const target = ENTITIES[f.ref.entity];
      const rows = refData[f.ref.entity] ?? [];
      return (
        <select required={f.required} value={String(val ?? "")} onChange={(e) => set(f.name, e.target.value)} style={selectStyle}>
          <option value="">{f.required ? "— choose —" : f.ref.emptyLabel ?? "—"}</option>
          {rows.map((r) => (
            <option key={String(r[target.pk])} value={String(r[target.pk])}>
              {f.ref!.format(r)}
            </option>
          ))}
        </select>
      );
    }
    if (f.options) {
      return (
        <select required={f.required} value={String(val ?? "")} onChange={(e) => set(f.name, e.target.value)} style={selectStyle}>
          <option value="">{f.required ? "— choose —" : "—"}</option>
          {f.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          {/* keep an unlisted stored value selectable instead of silently dropping it */}
          {val !== "" && val !== null && !f.options.includes(String(val)) && (
            <option value={String(val)}>{String(val)}</option>
          )}
        </select>
      );
    }
    if (f.type === "textarea") {
      return (
        <textarea
          rows={3}
          required={f.required}
          value={String(val ?? "")}
          onChange={(e) => set(f.name, e.target.value)}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      );
    }
    if (f.type === "bool") {
      return (
        <input
          type="checkbox"
          checked={val === 1 || val === true || val === "1"}
          onChange={(e) => set(f.name, e.target.checked ? 1 : 0)}
          style={{ width: 18, height: 18, accentColor: GOLD }}
        />
      );
    }
    return (
      <input
        type={f.type === "number" ? "number" : "text"}
        step={f.type === "number" ? "any" : undefined}
        required={f.required}
        value={String(val ?? "")}
        onChange={(e) => set(f.name, e.target.value)}
        style={inputStyle}
      />
    );
  };

  const groupFields = new Set(group?.fields ?? []);
  const normalFields = def.fields.filter((f) => !groupFields.has(f.name));

  const fieldRow = (f: FieldDef) => (
    <label key={f.name} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#9c8a5e" }}>
      <span>
        {f.name}
        {f.required ? " *" : ""}
        {f.hint && <span style={{ fontStyle: "italic", opacity: 0.75 }}> — {f.hint}</span>}
      </span>
      {control(f)}
    </label>
  );

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="cinzel" style={{ fontSize: 14, letterSpacing: ".12em", color: "#e2c682" }}>
        {initial ? `EDIT ${def.label.toUpperCase()} #${String(initial[def.pk])}` : `NEW — ${def.label.toUpperCase()}`}
      </div>
      {def.manualPk && !initial && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#9c8a5e" }}>
          {def.pk} *
          <input required value={String(values[def.pk] ?? "")} onChange={(e) => set(def.pk, e.target.value)} style={inputStyle} />
        </label>
      )}
      {normalFields.map(fieldRow)}
      {group && (
        <fieldset style={{ border: `1px dashed ${GOLD}`, borderRadius: 2, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
          <legend className="cinzel" style={{ fontSize: 11, letterSpacing: ".12em", color: GOLD, padding: "0 6px" }}>
            {group.label}
          </legend>
          {def.fields.filter((f) => groupFields.has(f.name)).map(fieldRow)}
        </fieldset>
      )}
      {error && <div style={{ color: "#e08060", fontSize: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={busy} className="cinzel" style={{ ...btnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : "SAVE"}
        </button>
        <button type="button" onClick={onCancel} className="cinzel" style={{ ...btnStyle, background: "none", border: BORDER, color: "#9c8a5e" }}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

// ── entity browser ───────────────────────────────────────────────────────────

function EntityPanel({ name }: { name: string }) {
  const def = ENTITIES[name];
  const compact = useCompact();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refData, setRefData] = useState<RefData>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [query, setQuery] = useState("");

  const fieldByName = useMemo(() => new Map(def.fields.map((f) => [f.name, f])), [def]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [own, ...refs] = await Promise.all([
        api(`/api/admin/data/${name}`),
        ...refEntities(def).map((e) => api(`/api/admin/data/${e}`).then((d) => [e, (d as { rows: Row[] }).rows] as const)),
      ]);
      setRows((own as { rows: Row[] }).rows);
      setRefData(Object.fromEntries(refs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
    }
  }, [name, def]);

  useEffect(() => {
    setRows(null);
    setEditing(null);
    setQuery("");
    load();
  }, [load]);

  const save = async (values: Row) => {
    if (editing === "new") {
      await api(`/api/admin/data/${name}`, { method: "POST", body: JSON.stringify(values) });
    } else if (editing) {
      await api(`/api/admin/data/${name}/${encodeURIComponent(String(editing[def.pk]))}`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
    }
    setEditing(null);
    await load();
  };

  const remove = async (row: Row) => {
    const id = String(row[def.pk]);
    if (!confirm(`Delete ${def.label} ${id}? Linked child rows are removed with it.`)) return;
    try {
      await api(`/api/admin/data/${name}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  /** cell text with FK ids resolved to their display labels */
  const cellText = (row: Row, col: string): string | null => {
    const v = row[col];
    if (v === null || v === undefined) return null;
    const f = fieldByName.get(col);
    if (f?.ref) return refLabel(f, refData, v);
    return String(v);
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      def.listCols.some((c) => (cellText(row, c) ?? "").toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, refData, def]);

  const thStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    background: PANEL_SOLID,
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    letterSpacing: ".1em",
    color: GOLD,
    borderBottom: BORDER,
    whiteSpace: "nowrap",
    zIndex: 1,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", flex: "none" }}>
        <h2 className="cinzel" style={{ margin: 0, fontSize: 20, color: "#e2c682" }}>
          {def.label}
          {rows && (
            <span style={{ fontSize: 13, color: "#9c8a5e", marginLeft: 10, letterSpacing: 0 }}>
              {filtered && filtered.length !== rows.length ? `${filtered.length} of ${rows.length}` : `${rows.length} entries`}
            </span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {rows && rows.length > 5 && (
            <input
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...inputStyle, width: compact ? 130 : 180, padding: "7px 10px", fontSize: 16 }}
            />
          )}
          <button onClick={() => setEditing("new")} className="cinzel" style={btnStyle}>+ NEW</button>
        </div>
      </div>

      {editing !== null && (
        <div style={{ background: PANEL, border: BORDER, borderRadius: 3, padding: "18px 20px", flex: "none", maxHeight: "60vh", overflowY: "auto" }}>
          <RecordForm def={def} initial={editing === "new" ? null : editing} refData={refData} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {error && <div style={{ color: "#e08060", flex: "none" }}>{error}</div>}
      {rows === null && !error && <div style={{ color: "#9c8a5e", fontStyle: "italic" }}>Consulting the archive…</div>}

      {filtered && (
        <div style={{ overflow: "auto", background: PANEL, border: BORDER, borderRadius: 3, flex: 1, minHeight: 0 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                {def.listCols.map((c) => (
                  <th key={c} className="cinzel" style={thStyle}>{c}</th>
                ))}
                <th style={{ ...thStyle, width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={String(row[def.pk] ?? i)} style={{ borderBottom: "1px solid rgba(74,58,24,.4)" }}>
                  {def.listCols.map((c) => {
                    const text = cellText(row, c);
                    return (
                      <td key={c} style={{ padding: "9px 12px", color: PARCH, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={text ?? undefined}>
                        {text === null ? <span style={{ opacity: 0.4 }}>—</span> : text}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                    <button onClick={() => setEditing(row)} className="cinzel" style={{ ...btnStyle, padding: compact ? "10px 14px" : "5px 10px", fontSize: compact ? 11.5 : 10.5, marginRight: 6 }}>
                      EDIT
                    </button>
                    <button onClick={() => remove(row)} className="cinzel" style={{ ...btnStyle, padding: compact ? "10px 14px" : "5px 10px", fontSize: compact ? 11.5 : 10.5, background: "#3d1410", borderColor: "#8c4134", color: "#e0a898" }}>
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={def.listCols.length + 1} style={{ padding: 16, color: "#9c8a5e", fontStyle: "italic" }}>
                    {query ? "Nothing matches the filter." : "The archive holds no entries yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── résumés (PDF blobs — outside the generic entity system) ──────────────────

interface ResumeRow {
  id: number;
  label: string;
  file_path: string;
  file_name: string | null;
  is_default: number;
  bytes: number | null;
}

function ResumePanel() {
  const compact = useCompact();
  const [rows, setRows] = useState<ResumeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0); // remounts the file input to clear it

  const load = useCallback(() => {
    api("/api/admin/resume")
      .then((d) => setRows((d as { rows: ResumeRow[] }).rows))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label);
      if (makeDefault) fd.append("is_default", "1");
      // raw fetch: the api() helper forces a JSON content type on bodies
      const res = await fetch("/api/admin/resume", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      setLabel("");
      setFile(null);
      setMakeDefault(false);
      setFileKey((k) => k + 1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, init?: RequestInit) => {
    setError(null);
    try {
      await api(path, init);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: ".1em",
    color: GOLD, borderBottom: BORDER, whiteSpace: "nowrap", background: PANEL_SOLID,
  };
  const td: React.CSSProperties = { padding: "9px 12px", color: PARCH };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 }}>
      <h2 className="cinzel" style={{ margin: 0, fontSize: 20, color: "#e2c682" }}>
        Résumés
        {rows && <span style={{ fontSize: 13, color: "#9c8a5e", marginLeft: 10, letterSpacing: 0 }}>{rows.length} variants</span>}
      </h2>

      <form onSubmit={upload} style={{ background: PANEL, border: BORDER, borderRadius: 3, padding: "16px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flex: "none" }}>
        <input
          placeholder="Label — e.g. Software Engineer"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          style={{ ...inputStyle, width: compact ? "100%" : 260 }}
        />
        <input
          key={fileKey}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, width: compact ? "100%" : 280, padding: "7px 11px" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: PARCH, cursor: "pointer" }}>
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          make default
        </label>
        <button type="submit" disabled={busy} className="cinzel" style={{ ...btnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "UPLOADING…" : "+ UPLOAD PDF"}
        </button>
      </form>

      {error && <div style={{ color: "#e08060", flex: "none" }}>{error}</div>}
      {rows === null && !error && <div style={{ color: "#9c8a5e", fontStyle: "italic" }}>Consulting the archive…</div>}

      {rows && (
        <div style={{ overflow: "auto", background: PANEL, border: BORDER, borderRadius: 3, flex: 1, minHeight: 0 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>label</th>
                <th style={th}>file</th>
                <th style={th}>size</th>
                <th style={th}>default</th>
                <th style={{ ...th, width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(74,58,24,.4)" }}>
                  <td style={td}>{r.label}</td>
                  <td style={td}>
                    {r.bytes ? (
                      <a href={`/api/resume/${r.id}`} target="_blank" rel="noreferrer">{r.file_name ?? "resume.pdf"}</a>
                    ) : (
                      <span title="Legacy static path — file may not exist under public/">
                        <a href={r.file_path} target="_blank" rel="noreferrer">{r.file_path}</a>{" "}
                        <span style={{ color: "#9c8a5e", fontStyle: "italic" }}>(static path)</span>
                      </span>
                    )}
                  </td>
                  <td style={td}>{r.bytes ? `${Math.round(r.bytes / 1024)} KB` : <span style={{ opacity: 0.4 }}>—</span>}</td>
                  <td style={td}>
                    {r.is_default ? (
                      <span className="cinzel" style={{ fontSize: 11, letterSpacing: ".1em", color: GOLD }}>◆ DEFAULT</span>
                    ) : (
                      <button onClick={() => act(`/api/admin/resume/${r.id}`, { method: "PUT" })} className="cinzel" style={{ ...btnStyle, padding: compact ? "10px 14px" : "5px 10px", fontSize: compact ? 11.5 : 10.5 }}>
                        MAKE DEFAULT
                      </button>
                    )}
                  </td>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                    <button
                      onClick={() => window.confirm(`Delete “${r.label}”? Visitors will no longer see it.`) && act(`/api/admin/resume/${r.id}`, { method: "DELETE" })}
                      className="cinzel"
                      style={{ ...btnStyle, padding: compact ? "10px 14px" : "5px 10px", fontSize: compact ? 11.5 : 10.5, background: "#3d1410", borderColor: "#8c4134", color: "#e0a898" }}
                    >
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#9c8a5e", fontStyle: "italic" }}>No résumés yet — upload one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── shell ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [state, setState] = useState<{ checked: boolean; authenticated: boolean; needsSetup: boolean; email: string | null }>({
    checked: false, authenticated: false, needsSetup: false, email: null,
  });
  const [entity, setEntity] = useState("regions");
  const compact = useCompact();

  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const [key, def] of Object.entries(ENTITIES)) (g[def.group] ??= []).push(key);
    (g.Career ??= []).push("__resumes"); // custom blob panel, not a generic entity
    return g;
  }, []);

  useEffect(() => {
    api("/api/admin/auth")
      .then((d) => {
        const data = d as { authenticated: boolean; needsSetup: boolean; email: string | null };
        setState({ checked: true, authenticated: data.authenticated, needsSetup: data.needsSetup, email: data.email });
      })
      .catch(() => setState((s) => ({ ...s, checked: true })));
  }, []);

  if (!state.checked) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9c8a5e", fontStyle: "italic" }}>Unlocking the archive…</div>;
  }

  if (!state.authenticated) {
    return <AuthGate needsSetup={state.needsSetup} onDone={(email) => setState({ checked: true, authenticated: true, needsSetup: false, email })} />;
  }

  return (
    // the game's globals.css sets body overflow:hidden — the shell owns all
    // scrolling (dvh: 100vh hides the bottom strip under iOS Safari's toolbar)
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ flex: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: compact ? "10px 14px" : "14px 22px", borderBottom: "2px solid #4a3a18", background: PANEL }}>
        <div>
          <div className="cinzel" style={{ fontSize: 11, letterSpacing: ".22em", color: GOLD }}>THE STEWARD&apos;S DESK</div>
          {!compact && <div className="cinzel" style={{ fontSize: 18, color: "#e2c682" }}>There and Back Again — Archive</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" className="cinzel" style={{ fontSize: 11.5, letterSpacing: ".1em" }}>← TO THE MAP</a>
          {!compact && <span style={{ fontSize: 13.5, fontStyle: "italic", color: "#9c8a5e" }}>{state.email}</span>}
          <button
            onClick={async () => {
              await api("/api/admin/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
              setState((s) => ({ ...s, authenticated: false, email: null }));
            }}
            className="cinzel"
            style={{ ...btnStyle, background: "none", border: BORDER, color: "#9c8a5e" }}
          >
            SIGN OUT
          </button>
        </div>
      </header>

      {/* phones: the 230px sidebar would eat two-thirds of the screen — a
          grouped native select does the same navigation in one thumb-height row */}
      {compact && (
        <div style={{ flex: "none", padding: "10px 14px", borderBottom: "2px solid #4a3a18", background: "rgba(20,13,6,.75)" }}>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            style={{ ...inputStyle, appearance: "auto", background: PANEL_SOLID }}
          >
            {Object.entries(groups).map(([group, keys]) => (
              <optgroup key={group} label={group}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k === "__resumes" ? "Résumés (PDF)" : ENTITIES[k].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", alignItems: "stretch", minHeight: 0 }}>
        {!compact && (
        <nav style={{ width: 230, flex: "none", borderRight: "2px solid #4a3a18", padding: "16px 12px", overflowY: "auto", background: "rgba(20,13,6,.75)" }}>
          {Object.entries(groups).map(([group, keys]) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <div className="cinzel" style={{ fontSize: 10.5, letterSpacing: ".2em", color: GOLD, padding: "0 8px 6px" }}>{group.toUpperCase()}</div>
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => setEntity(k)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    fontSize: 14.5,
                    background: entity === k ? "rgba(201,150,60,.14)" : "none",
                    border: "none",
                    borderLeft: entity === k ? `2px solid ${GOLD}` : "2px solid transparent",
                    color: entity === k ? "#e2c682" : "#a89670",
                    cursor: "pointer",
                  }}
                >
                  {k === "__resumes" ? "Résumés (PDF)" : ENTITIES[k].label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        )}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, padding: compact ? "14px 10px" : "20px 24px", display: "flex", flexDirection: "column" }}>
          {entity === "__resumes" ? <ResumePanel /> : <EntityPanel key={entity} name={entity} />}
        </main>
      </div>
    </div>
  );
}
