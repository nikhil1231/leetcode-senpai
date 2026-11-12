"use client";
import { createRoot } from "react-dom/client";
import { Chat, type ChatMessage } from "./Chat";

// The shared chat for the imperative modules in src/legacy (through the bridge, as window.SenpaiChat.mount): they pass
// plain data, update() redraws with new data, and unmount() goes before their markup is replaced.
export type LegacyChatProps = {
  messages: ChatMessage[];
  running?: boolean;
  onSend?: (text: string) => void | Promise<void>;
  error?: string;
  empty?: string;
  placeholder?: string;
  label?: string;
  inputId?: string;
  typingLabel?: string;
  composer?: boolean;
  disabled?: boolean;
  draft?: string;
  onDraft?: (text: string) => void;
  maxLength?: number;
  className?: string;
};

export function mountChat(el: HTMLElement, props: LegacyChatProps) {
  const root = createRoot(el);
  const render = (p: LegacyChatProps) => root.render(
    <Chat {...p} running={Boolean(p.running)} empty={p.empty ? <p className="sd-muted">{p.empty}</p> : undefined}
      status={p.error ? <p className="ch-status is-error" role="status">{p.error}</p> : undefined} />,
  );
  render(props);
  return { update: render, unmount: () => root.unmount() };
}
