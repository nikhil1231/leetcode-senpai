"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLeetcodeStatus } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";

// The LeetCode cookie lives on the server (Firestore), not in this browser, so a save is visible to every device: the
// last one wins. An empty csrf keeps the stored one. Opens over whatever you're doing, a run included.
export function CookieModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const status = useLeetcodeStatus();
  const [session, setSession] = useState("");
  const [csrf, setCsrf] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const why = status.data?.state === "expired" ? "LeetCode stopped accepting the last one. Paste a fresh one to run, submit and grade." : "Needed to run and submit in the editor, and to grade your code.";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.trim()) { setError("Paste the LEETCODE_SESSION value."); return; }
    setBusy(true); setError("");
    try { await api("/leetcode-auth", "POST", { session: session.trim(), csrf: csrf.trim() || null }); }
    catch (err) { setError((err as Error).message || "Couldn't save the cookie."); setBusy(false); return; }
    let state = "unknown";
    try { ({ state } = await api("/leetcode-status")); } catch { /* unknown */ }
    qc.setQueryData(["api", "/leetcode-status"], { state });
    if (state === "expired") { setError("LeetCode rejected that one — copy it again from a signed-in leetcode.com tab."); setBusy(false); return; }
    qc.invalidateQueries({ queryKey: ["editor-can-judge"] });
    onClose();
    toast(state === "ok" ? "Cookie saved — LeetCode accepts it." : "Cookie saved.");
  };
  return (
    <Modal open onClose={onClose} title="LeetCode cookie" subtitle={why}>
      <form id="cookie-form" onSubmit={submit}>
        <label className="label-sm" htmlFor="cookie-session">LEETCODE_SESSION</label>
        <input id="cookie-session" className="input" type="password" autoComplete="off" spellCheck={false} placeholder="paste the cookie value" autoFocus value={session} onChange={(e) => setSession(e.target.value)} />
        <label className="label-sm" htmlFor="cookie-csrf">csrftoken <span className="help-inline">optional</span></label>
        <input id="cookie-csrf" className="input" type="password" autoComplete="off" spellCheck={false} value={csrf} onChange={(e) => setCsrf(e.target.value)} />
        <p className="help">From a signed-in leetcode.com tab: DevTools → Application → Cookies. Stored only in this browser and sent per request; never saved server-side.</p>
        {error && <p className="quickstart-error">{error}</p>}
        <div className="overlay-actions">
          <button className="button is-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="button is-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Save cookie"}</button>
        </div>
      </form>
    </Modal>
  );
}
