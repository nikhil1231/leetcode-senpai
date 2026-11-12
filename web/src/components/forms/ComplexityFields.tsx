"use client";
import { useId } from "react";

const PRESETS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"];
const EXAMPLES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)", "O(n + m)", "O(nm)", "O(n log k)", "O(k log n)", "O(V + E)", "O(E log V)", "O(n sqrt n)", "O(log(min(n, m)))"];

function Field({ id, label, placeholder, listId, value, onChange, disabled, onEnter }: {
  id: string; label: string; placeholder: string; listId: string; value: string; onChange: (v: string) => void; disabled?: boolean; onEnter?: () => void;
}) {
  return (
    <div className="complexity-field">
      <label className="label-sm" htmlFor={id}>{label}</label>
      <input id={id} className="input complexity-input" type="text" list={listId} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        inputMode="text" placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && onEnter) { e.preventDefault(); onEnter(); } }} />
      <div className="complexity-presets">
        {PRESETS.map((c) => <button key={c} type="button" className="complexity-preset" disabled={disabled} onClick={() => onChange(c)}>{c}</button>)}
      </div>
    </div>
  );
}

// Time and space, typed or picked from presets. Used by the plan, recall and annotate dialogs.
export function ComplexityFields({ time, space, onTime, onSpace, timeLabel = "Time", spaceLabel = "Space", disabled, onEnterTime, idPrefix }: {
  time: string; space: string; onTime: (v: string) => void; onSpace: (v: string) => void; timeLabel?: string; spaceLabel?: string;
  disabled?: boolean; onEnterTime?: () => void; idPrefix: string;
}) {
  const listId = useId();
  return (
    <div className="complexity-fields">
      <datalist id={listId}>{EXAMPLES.map((c) => <option key={c} value={c} />)}</datalist>
      <Field id={`${idPrefix}-time`} label={timeLabel} placeholder="O(n + m)" listId={listId} value={time} onChange={onTime} disabled={disabled} onEnter={onEnterTime} />
      <Field id={`${idPrefix}-space`} label={spaceLabel} placeholder="O(1)" listId={listId} value={space} onChange={onSpace} disabled={disabled} />
    </div>
  );
}
