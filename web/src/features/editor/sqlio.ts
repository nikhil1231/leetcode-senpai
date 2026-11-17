// LeetCode's database problems as tables. A test case is one line of JSON, {"headers": {table: [columns]}, "rows":
// {table: [[values]]}}; a query's answer is {"headers": [columns], "values": [[values]]}. The editor shows and edits
// both as tables and writes cases back in LeetCode's own shape, so Run sends exactly what LeetCode expects.

export type Cell = string | number | boolean | null;
export interface Tables { headers: Record<string, string[]>; rows: Record<string, Cell[][]> }
export interface Answer { headers: string[]; values: Cell[][] }
export type Schema = Record<string, Record<string, string>> | null | undefined;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseCase(line: string): Tables | null {
  try {
    const v = JSON.parse(line);
    if (!isObj(v) || !isObj(v.headers) || !isObj(v.rows)) return null;
    const headers: Record<string, string[]> = {}, rows: Record<string, Cell[][]> = {};
    for (const [t, cols] of Object.entries(v.headers)) {
      if (!Array.isArray(cols)) return null;
      headers[t] = cols.map(String);
      const r = v.rows[t] ?? [];
      if (!Array.isArray(r) || !r.every(Array.isArray)) return null;
      rows[t] = r as Cell[][];
    }
    return { headers, rows };
  } catch { return null; }
}

// Every non-blank line of the test box as tables, or null when any line isn't one (the box is then edited as text).
export function parseCases(input: string): Tables[] | null {
  const lines = input.split("\n").filter((l) => l.trim());
  const cases = lines.map(parseCase);
  return cases.every(Boolean) ? (cases as Tables[]) : null;
}

export const formatCase = (t: Tables) => JSON.stringify({ headers: t.headers, rows: t.rows });
export const formatCases = (cases: Tables[]) => cases.map(formatCase).join("\n");

export function parseAnswer(text: unknown): Answer | null {
  if (typeof text !== "string") return null;
  try {
    const v = JSON.parse(text);
    if (!isObj(v) || !Array.isArray(v.headers) || !Array.isArray(v.values ?? [])) return null;
    return { headers: v.headers.map(String), values: ((v.values ?? []) as Cell[][]).filter(Array.isArray) };
  } catch { return null; }
}

const NUMERIC = /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)\b/i;

// A typed cell back to a value: NULL is null, a number column takes numbers, everything else stays text (dates
// included, as LeetCode writes them). With no schema, a cell that reads as a number is one.
export function parseCell(text: string, type?: string): Cell {
  const s = text.trim();
  if (/^null$/i.test(s)) return null;
  const numeric = type ? NUMERIC.test(type) : /^-?\d+(\.\d+)?$/.test(s);
  if (numeric && s !== "" && Number.isFinite(Number(s))) return Number(s);
  return text;
}

export const cellText = (v: Cell) => (v === null ? "null" : String(v));

// The SQL dialect's schema for completion: {table: [columns]}.
export function completionSchema(schema: Schema, cases: Tables[] = []) {
  const out: Record<string, string[]> = {};
  for (const [t, cols] of Object.entries(schema || {})) out[t] = Object.keys(cols);
  for (const c of cases) for (const [t, cols] of Object.entries(c.headers)) out[t] ??= cols;
  return out;
}

// Which rows of an answer aren't in the expected one, as a multiset (LeetCode ignores row order unless asked).
export function extraRows(got: Answer, want: Answer | null): boolean[] {
  if (!want) return got.values.map(() => false);
  const left = new Map<string, number>();
  for (const r of want.values) { const k = JSON.stringify(r); left.set(k, (left.get(k) || 0) + 1); }
  return got.values.map((r) => {
    const k = JSON.stringify(r), n = left.get(k) || 0;
    if (n) { left.set(k, n - 1); return false; }
    return true;
  });
}

// Edits to one case, each returning a new case.
export function setCell(t: Tables, table: string, row: number, col: number, value: Cell): Tables {
  const rows = t.rows[table].map((r, i) => (i === row ? r.map((v, j) => (j === col ? value : v)) : r));
  return { ...t, rows: { ...t.rows, [table]: rows } };
}

export function addRow(t: Tables, table: string, schema?: Schema): Tables {
  const cols = t.headers[table], last = t.rows[table][t.rows[table].length - 1];
  // A new row copies the last one's shape: the next id for a whole-number first column, blanks after it.
  const row: Cell[] = cols.map((c, j) => {
    const type = schema?.[table]?.[c];
    if (j === 0 && last && typeof last[0] === "number" && Number.isInteger(last[0])) return (last[0] as number) + 1;
    return type && NUMERIC.test(type) ? 0 : last ? (typeof last[j] === "number" ? 0 : "") : "";
  });
  return { ...t, rows: { ...t.rows, [table]: [...t.rows[table], row] } };
}

export function removeRow(t: Tables, table: string, row: number): Tables {
  return { ...t, rows: { ...t.rows, [table]: t.rows[table].filter((_, i) => i !== row) } };
}
