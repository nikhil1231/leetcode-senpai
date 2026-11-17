"use client";
// The editor's tables for a database problem: the Tests box as editable tables (one tab per case), and a Run's or
// Submit's input, output and expected answer drawn as tables. The test box's text stays LeetCode's JSON throughout.
import { useEffect, useState } from "react";
import { addRow, cellText, extraRows, formatCases, parseAnswer, parseCase, parseCases, parseCell, removeRow, setCell, type Answer, type Cell, type Schema, type Tables } from "./sqlio";

function CellInput({ value, type, label, onCommit }: { value: Cell; type?: string; label: string; onCommit: (v: Cell) => void }) {
  const [text, setText] = useState(cellText(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(cellText(value)); }, [value, editing]);
  return <input className={`sql-cell${value === null ? " is-null" : ""}`} value={text} aria-label={label} spellCheck={false}
    onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
    onChange={(e) => { setText(e.target.value); onCommit(parseCell(e.target.value, type)); }} />;
}

function EditTable({ name, t, schema, onChange }: { name: string; t: Tables; schema: Schema; onChange: (t: Tables) => void }) {
  const cols = t.headers[name], rows = t.rows[name], types = schema?.[name] || {};
  return (
    <div className="sql-table-wrap">
      <div className="sql-table-name">{name} <span className="small">{rows.length} {rows.length === 1 ? "row" : "rows"}</span></div>
      <div className="sql-scroll">
        <table className="sql-table is-edit">
          <thead><tr>{cols.map((c) => <th key={c} title={types[c] || undefined}>{c}{types[c] && <span className="sql-type">{types[c].toLowerCase()}</span>}</th>)}<th aria-label="Remove row" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c, j) => <td key={c}><CellInput value={r[j] ?? null} type={types[c]} label={`${name} row ${i + 1} ${c}`} onCommit={(v) => onChange(setCell(t, name, i, j, v))} /></td>)}
                <td className="sql-row-tool"><button type="button" className="console-tool" title="Remove this row" aria-label={`Remove ${name} row ${i + 1}`} onClick={() => onChange(removeRow(t, name, i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="console-tool sql-add-row" onClick={() => onChange(addRow(t, name, schema))}>+ Row</button>
    </div>
  );
}

// The Tests panel for SQL. Falls back to the raw text when the box isn't LeetCode tables (a stray edit in text mode).
export function SqlTests({ input, onChange, schema, onRun, examples }: { input: string; onChange: (s: string) => void; schema: Schema; onRun: () => void; examples: string[] }) {
  const cases = parseCases(input);
  const [sel, setSel] = useState(0);
  const [text, setText] = useState(false);
  const cur = cases && cases.length ? Math.min(sel, cases.length - 1) : 0;
  const write = (next: Tables[]) => onChange(formatCases(next));
  const runKey = (e: React.KeyboardEvent) => { if (e.key === "'" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); } };

  if (text || !cases || !cases.length) {
    return (
      <div className="sql-tests" onKeyDown={runKey}>
        <div className="sql-tests-head">
          <span className="label-sm">Test input <span className="help-inline">one case per line, as LeetCode&apos;s JSON tables</span></span>
          {cases && cases.length > 0 ? <button type="button" className="console-tool" onClick={() => setText(false)}>Edit as tables</button>
            : <button type="button" className="console-tool" onClick={() => { onChange(examples.join("\n")); setText(false); }}>Use the examples</button>}
        </div>
        {!cases && <p className="small sql-bad">This isn&apos;t valid JSON tables, so it can only be edited as text.</p>}
        <textarea id="editor-input" className="editor-input" rows={4} spellCheck={false} value={input} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  const t = cases[cur];
  return (
    <div className="sql-tests" onKeyDown={runKey}>
      <div className="sql-tests-head">
        <div className="editor-case-tabs" role="tablist">
          {cases.map((_, i) => <button key={i} className="editor-case-tab" type="button" role="tab" aria-selected={i === cur} onClick={() => setSel(i)}>Case {i + 1}</button>)}
          <button type="button" className="console-tool" title="A copy of this case to change" onClick={() => { write([...cases, parseCase(JSON.stringify(t))!]); setSel(cases.length); }}>+ Case</button>
          {cases.length > 1 && <button type="button" className="console-tool" onClick={() => { write(cases.filter((_, i) => i !== cur)); setSel(Math.max(0, cur - 1)); }}>Delete case</button>}
        </div>
        <button type="button" className="console-tool" onClick={() => setText(true)}>Edit as text</button>
      </div>
      <p className="small sql-hint">Type <code>null</code> for NULL.</p>
      {Object.keys(t.headers).map((name) => <EditTable key={`${cur}-${name}`} name={name} t={t} schema={schema} onChange={(next) => write(cases.map((c, i) => (i === cur ? next : c)))} />)}
    </div>
  );
}

export function AnswerTable({ answer, extra, mark = "is-off" }: { answer: Answer; extra?: boolean[]; mark?: string }) {
  if (!answer.headers.length) return <p className="small">No columns.</p>;
  return (
    <div className="sql-scroll">
      <table className="sql-table">
        <thead><tr>{answer.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {answer.values.length ? answer.values.map((r, i) => (
            <tr key={i} className={extra?.[i] ? mark : undefined} title={extra?.[i] ? (mark === "is-off" ? "Not in the expected answer" : "Missing from your output") : undefined}>{answer.headers.map((_, j) => <td key={j} className={r[j] === null ? "is-null" : undefined}>{cellText(r[j] ?? null)}</td>)}</tr>
          )) : <tr><td colSpan={answer.headers.length} className="small">No rows</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CaseTables({ t }: { t: Tables }) {
  return <>{Object.keys(t.headers).map((name) => (
    <div className="sql-table-wrap" key={name}><div className="sql-table-name">{name}</div>
      <AnswerTable answer={{ headers: t.headers[name], values: t.rows[name] }} /></div>
  ))}</>;
}

// One labelled block of a judging: tables when it reads as tables, else the text as LeetCode sent it.
// `against` marks the rows the other answer doesn't have: on Output, rows that shouldn't be there; on Expected, rows
// the output is missing.
export function SqlBlock({ label, value, against, mark, cls = "" }: { label: string; value: unknown; against?: unknown; mark?: string; cls?: string }) {
  if (value == null || value === "") return null;
  const answer = parseAnswer(value);
  const tables = answer ? null : typeof value === "string" ? parseCase(value) : null;
  return (
    <div className={`editor-io sql-io ${cls}`}><span>{label}</span>
      {answer ? <AnswerTable answer={answer} extra={against !== undefined ? extraRows(answer, parseAnswer(against)) : undefined} mark={mark} />
        : tables ? <CaseTables t={tables} /> : <pre>{String(value)}</pre>}
    </div>
  );
}
