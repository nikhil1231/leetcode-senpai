"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { TAB_TITLES } from "@/lib/sections";
import { useToast } from "@/lib/toast";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function DiscoverPage() {
  useHeading(...TAB_TITLES.discover);
  const qc = useQueryClient();
  const toast = useToast();
  const packs = useQuery({ queryKey: ["api", "/packs"], queryFn: () => api("/packs") });
  const [importing, setImporting] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [finding, setFinding] = useState(false);
  const [results, setResults] = useState<Any>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  if (packs.isLoading) return <Loader message="Loading packs…" />;
  const importPack = async (name: string) => {
    setImporting(name);
    setStatus(`Importing ${name} (fetching metadata, be patient)…`);
    try {
      const r = await api("/import/pack", "POST", { pack: name, fetch_metadata: true });
      setStatus(`Imported ${r.total} (${r.metadata_fetched} enriched, ${r.metadata_failed} failed).`);
      qc.invalidateQueries();
    } catch (e) { setStatus((e as Error).message); } finally { setImporting(null); }
  };
  const find = async () => {
    setFinding(true); setResults("loading");
    try { setResults(await api(`/discover?topic=${encodeURIComponent(topic.trim())}&difficulty=${difficulty}`)); }
    catch (e) { setResults({ error: (e as Error).message }); } finally { setFinding(false); }
  };
  const importOne = async (slug: string) => {
    setImported(new Set(imported).add(slug));
    await api("/import/problem", "POST", { slug });
    toast("Imported."); qc.invalidateQueries();
  };
  return (
    <>
      <div className="section-title">Curated packs</div>
      <div className="pack-grid">{(packs.data as Any[] | undefined)?.map((p) => (
        <div className="box pack-card" key={p.name}>
          <div><b>{p.label}</b><div className="small">{p.imported}/{p.total} imported</div>
            <div className="goal-track"><span className="goal-fill" style={{ width: `${Math.round((p.imported / p.total) * 100)}%` }} /></div></div>
          <button className="button is-primary is-small" disabled={importing === p.name} onClick={() => importPack(p.name)}>{p.imported >= p.total ? "Refresh" : "Import"}</button>
        </div>))}</div>
      <div className="section-title">Discover highly-rated problems</div>
      <p className="help">Only problems the community actually likes (like-ratio + vote thresholds in Settings). Needs your LeetCode cookie.</p>
      <div className="discover-filters">
        <div className="control"><input className="input" placeholder="topic slug e.g. two-pointers (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
        <div className="control"><div className="select is-fullwidth"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div></div>
        <button className="button is-primary" disabled={finding} onClick={find}>{finding ? <><span className="spinner spinner-sm" /> Finding…</> : "Find gems"}</button>
      </div>
      <div id="discover-results" className="mt-4">
        {results === "loading" ? <Loader message="Scanning the problem set…" />
          : results?.error ? <p className="empty">{results.error}</p>
          : results && !results.candidates.length ? <p className="empty">No new problems cleared the quality bar.</p>
          : results && (
            <table className="table is-app is-fullwidth is-hoverable"><thead><tr><th>Problem</th><th>Diff</th><th>👍 ratio</th><th>Votes</th><th>AC</th><th /></tr></thead>
              <tbody>{results.candidates.map((c: Any) => (
                <tr key={c.slug}><td><a href={c.url} target="_blank">{c.title}</a><div className="small">{c.category}</div></td>
                  <td><DifficultyBadge difficulty={c.difficulty} /></td><td><b>{Math.round(c.like_ratio * 100)}%</b></td>
                  <td className="small">{c.votes.toLocaleString()}</td><td className="small">{c.ac_rate != null ? c.ac_rate + "%" : "—"}</td>
                  <td><button className="button is-primary is-small" disabled={imported.has(c.slug)} onClick={() => importOne(c.slug)}>{imported.has(c.slug) ? "✓" : "Import"}</button></td></tr>))}</tbody></table>
          )}
      </div>
      <div className="help" id="import-status">{status}</div>
    </>
  );
}
