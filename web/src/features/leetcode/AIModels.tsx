"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { modelName } from "@/lib/models";
import { useToast } from "@/lib/toast";

type Option = { id: string; free: boolean };
type Area = {
  key: string; label: string; uses: string; kind: string; model: string; chosen: string; default: string;
  follows_main: boolean; free: boolean; options: Option[];
};
type Models = { areas: Area[]; localrouter: boolean };

const KEY = ["api", "/models"];
const label = (o: Option) => `${modelName(o.id)}${o.free ? " · free" : ""} (${o.id})`;

/** Settings > AI models: every part of the app that uses a model, each with its own choice. */
export function AIModels() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery<Models>({ queryKey: KEY, queryFn: () => api("/models") });
  const [saving, setSaving] = useState("");
  if (q.isLoading) return <p className="help">Loading models…</p>;
  if (q.error || !q.data) return <p className="help">Couldn&apos;t load the models: {(q.error as Error)?.message}</p>;
  const main = q.data.areas.find((a) => a.key === "main");

  const choose = async (area: Area, model: string) => {
    setSaving(area.key);
    try {
      const r = await api("/models", "POST", { models: { [area.key]: model } });
      qc.setQueryData(KEY, { ...q.data, ...r });
      qc.invalidateQueries({ queryKey: ["api", "/overview"] });
      toast(`${area.label}: ${modelName(r.areas.find((a: Area) => a.key === area.key)?.model)}`);
    } catch (e) { toast((e as Error).message); } finally { setSaving(""); }
  };

  return (
    <div className="ai-models">
      {q.data.areas.map((a) => {
        const fallback = a.follows_main ? `Same as main (${modelName(main?.model)})` : `Default (${modelName(a.default)})`;
        const id = `model-${a.key}`;
        return (
          <div className="ai-model" key={a.key}>
            <div className="ai-model-text">
              <label htmlFor={id}>{a.label}</label>
              <div className="help">{a.uses}</div>
            </div>
            <div className="select is-fullwidth">
              <select id={id} value={a.chosen} disabled={saving === a.key} onChange={(e) => choose(a, e.target.value)}>
                <option value="">{fallback}</option>
                {a.options.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      <p className="help">
        Free models run on LocalRouter, this box&apos;s gateway to the Claude subscriptions{q.data.localrouter ? "" : " (not configured here, so none are listed)"}.
        If it fails, a call falls back to OpenRouter, except Anthropic models, which are never used through OpenRouter. Everything else is paid on OpenRouter.
      </p>
    </div>
  );
}
