// A line diff in unified style (changed lines with a little context), for showing what an assistant's patch would change in
// the file as it stands now. Longest common subsequence on lines; files here are a few hundred lines at most.
export function lineDiff(a: string, b: string, context = 2): string {
  const x = a.split("\n"), y = b.split("\n");
  if (a === b) return "";
  const n = x.length, m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: [" " | "+" | "-", string][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { ops.push([" ", x[i]]); i++; j++; } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push(["-", x[i++]]); else ops.push(["+", y[j++]]);
  }
  while (i < n) ops.push(["-", x[i++]]);
  while (j < m) ops.push(["+", y[j++]]);
  const keep = new Array(ops.length).fill(false);
  ops.forEach(([k], idx) => { if (k !== " ") for (let d = -context; d <= context; d++) if (ops[idx + d]) keep[idx + d] = true; });
  const out: string[] = [];
  let gap = false;
  ops.forEach(([k, line], idx) => {
    if (keep[idx]) { if (gap) out.push("@@ …"); gap = false; out.push(k + line); } else gap = true;
  });
  return out.join("\n");
}
