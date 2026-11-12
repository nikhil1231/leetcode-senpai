"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { shortLocalDate } from "@/lib/format";
import { useHeading } from "@/lib/heading";
import { TAB_TITLES } from "@/lib/sections";
import { useToast } from "@/lib/toast";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader, LoadError } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { CompactState } from "./TopicsPage";
import { useStartFlow } from "./useStartFlow";
import { useDsaIndex } from "./VisualisePage";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const DEFAULTS = { search: "", category: "", difficulty: "", due_status: "all", attempted: "all", leech: "all", sort: "number" };
type Filters = typeof DEFAULTS;

const queryString = (f: Filters) => {
  const q = new URLSearchParams();
  if (f.search.trim()) q.set("search", f.search.trim());
  if (f.category) q.set("category", f.category);
  if (f.difficulty) q.set("difficulty", f.difficulty);
  if (f.due_status !== "all") q.set("due_status", f.due_status);
  if (f.attempted !== "all") q.set("attempted", f.attempted);
  if (f.leech !== "all") q.set("leech", f.leech);
  if (f.sort !== "number") q.set("sort", f.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
};

const Select = ({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) =>
  <div className="control"><div className="select is-fullwidth"><select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></div></div>;

export function ProblemsPage() {
  useHeading(...TAB_TITLES.problems);
  const qc = useQueryClient();
  const toast = useToast();
  const start = useStartFlow();
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>({ ...DEFAULTS, search: params.get("search") || "" });
  const [debounced, setDebounced] = useState(filters);
  const [del, setDel] = useState<{ slug: string; title: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(filters), 180); return () => clearTimeout(t); }, [filters]);
  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const facets = useQuery({
    queryKey: ["api", "/problems/facets"],
    queryFn: async () => {
      try { return await api("/problems/facets"); } catch {
        let categories: Any[] = [];
        try { categories = (await api("/topics")).map((t: Any) => ({ value: t.category, count: t.total })); } catch { /* ignore */ }
        return { categories, difficulties: ["Easy", "Medium", "Hard"].map((value) => ({ value })), total: null };
      }
    },
  });
  const rows = useQuery({ queryKey: ["api", "/problems" + queryString(debounced)], queryFn: () => api("/problems" + queryString(debounced)) });
  const dsa = useDsaIndex().data;
  const bySlug = new Map<string, Any[]>();
  dsa?.topics.forEach((t: Any) => t.problems.forEach((p: Any) => { if (p.slug) bySlug.set(p.slug, [...(bySlug.get(p.slug) || []), t]); }));
  const opts = (list: Any[] = []) => list.map((f) => <option key={f.value} value={f.value}>{f.count == null ? f.value : `${f.value} (${f.count})`}</option>);
  const active = !!filters.search.trim() || filters.category || filters.difficulty || filters.due_status !== "all" || filters.attempted !== "all" || filters.leech !== "all";

  const remove = async () => {
    if (!del) return;
    if (typed.trim() !== del.slug) { setErr("Slug did not match."); return; }
    try {
      await api(`/problem/${encodeURIComponent(del.slug)}`, "DELETE", { confirm_slug: del.slug });
      toast(`Removed ${del.title}.`); setDel(null); setTyped(""); setErr(""); qc.invalidateQueries();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <div className="problems-toolbar">
        <div className="control problems-search"><input id="problems-search" className="input" placeholder="Search title, slug, or #" value={filters.search} onChange={(e) => set("search")(e.target.value)} /></div>
        <Select value={filters.category} onChange={set("category")}><option value="">Any topic</option>{opts(facets.data?.categories)}</Select>
        <Select value={filters.difficulty} onChange={set("difficulty")}><option value="">Any difficulty</option>{opts(facets.data?.difficulties)}</Select>
        <Select value={filters.due_status} onChange={set("due_status")}><option value="all">Any due status</option><option value="due">Due</option><option value="upcoming">Upcoming</option><option value="unscheduled">Unscheduled</option></Select>
        <Select value={filters.attempted} onChange={set("attempted")}><option value="all">Any attempts</option><option value="attempted">Attempted</option><option value="unattempted">Unattempted</option></Select>
        <Select value={filters.leech} onChange={set("leech")}><option value="all">Any leech</option><option value="only">Leech only</option><option value="exclude">Hide leech</option></Select>
        <Select value={filters.sort} onChange={set("sort")}>
          <option value="number">Sort by #</option><option value="title">Sort by title</option><option value="difficulty">Sort by difficulty</option>
          <option value="due_date">Sort by next review</option><option value="last_attempt">Sort by last attempt</option><option value="attempts">Sort by attempts</option></Select>
        {facets.data?.total != null && <span className="small">{facets.data.total} in library</span>}
      </div>
      <div id="problems-results">
        {rows.isLoading ? <Loader message="Loading problems…" /> : rows.error ? <LoadError error={rows.error} retry={() => rows.refetch()} />
          : !rows.data.length ? <p className="empty">{active ? "No matching problems for the current search/filter combination." : "No problems imported. Go to Discover."}</p>
          : (
            <table className="table is-app is-fullwidth is-hoverable problems-table">
              <thead><tr><th>#</th><th>Problem</th><th>Topic</th><th>Diff</th><th>Attempts</th><th>Next review</th><th>Last attempt</th><th>State</th><th>Leech</th><th /></tr></thead>
              <tbody>{(rows.data as Any[]).map((r) => {
                const category = r.neetcode_category || r.category || "";
                return (
                  <tr key={r.slug}>
                    <td className="small problem-number" data-label="#">{r.frontend_id || "-"}</td>
                    <td data-label="Problem"><a href={r.url} target="_blank">{r.title}</a></td>
                    <td className="small" data-label="Topic">{category || "-"}</td>
                    <td data-label="Diff"><DifficultyBadge difficulty={r.difficulty} /></td>
                    <td data-label="Attempts">{r.attempt_count || 0}</td>
                    <td className="small" data-label="Next review">{r.due_date || "-"}</td>
                    <td className="small" data-label="Last attempt">{shortLocalDate(r.last_attempt_at)}</td>
                    <td data-label="State"><CompactState state={r.mastery_state} /></td>
                    <td data-label="Leech">{r.leech ? <span className="tag is-danger is-light">leech</span> : <span className="small">-</span>}</td>
                    <td className="problem-action"><div className="problem-actions">
                      <button className="button start is-small" onClick={() => start(r.slug, "adhoc", "", r.title, category)}>Start</button>
                      {(bySlug.get(r.slug) || []).slice(0, 2).map((t) => <Link key={t.id} className="button is-small is-ghost vz-see" href={`/leetcode/visualise/${t.id}`} title={`Watch ${t.title} run, step by step`}>▶ {t.title}</Link>)}
                      {r.attempt_count ? <button className="button recall-start is-small is-link is-light" title="Recall the method from memory" onClick={() => start(r.slug, "adhoc", "recall", r.title, category)}>Recall</button>
                        : <button className="button is-ghost is-small icon-button problem-delete" type="button" aria-label={`Remove ${r.title}`} title="Remove from database" onClick={() => { setDel({ slug: r.slug, title: r.title }); setTyped(""); setErr(""); }}>&times;</button>}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
      </div>
      <Modal open={!!del} onClose={() => setDel(null)} title="Remove problem">
        <p className="small" id="delete-problem-copy">Remove &quot;{del?.title}&quot; from the problem database? This also removes its review card and cancels an active run.</p>
        <label className="label-sm">Type the slug to confirm</label>
        <input id="delete-problem-confirm" className="input" placeholder={del?.slug} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") remove(); }} />
        {err && <p id="delete-problem-error" className="help is-danger">{err}</p>}
        <div className="overlay-actions"><button className="button is-ghost" onClick={() => setDel(null)}>Cancel</button><button className="button is-danger" onClick={remove}>Remove</button></div>
      </Modal>
    </>
  );
}
