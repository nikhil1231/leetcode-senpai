// A chat screen: while a conversation is the page (a tutor session, an overview's check), its host is pinned to the
// area under the header and the page itself stops scrolling; only the conversation scrolls. The header shows what the
// conversation is about, and the page's own intro (title, description, progress) is hidden behind it.
// Leaving puts the header back, unless the page has set its own since. A host taken off the page leaves on its own.
import { getHeadingGlobal, setHeadingGlobal } from "./heading";

let active: { host: HTMLElement; saved: { title: string; sub: string }; title: string; sub: string; stop: () => void } | null = null;

function place(host: HTMLElement) {
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  const main = (document.querySelector(".content > main") as HTMLElement | null)?.getBoundingClientRect();
  host.style.setProperty("--chat-top", `${Math.max(0, Math.round(top))}px`);
  host.style.setProperty("--chat-left", `${Math.round(main?.left ?? 0)}px`);
  host.style.setProperty("--chat-right", `${Math.max(0, Math.round(window.innerWidth - (main?.right ?? window.innerWidth)))}px`);
}

export function enterChatScreen(host: HTMLElement, title: string, sub: string) {
  if (active?.host === host) {
    if (active.title !== title || active.sub !== sub) { active.title = title; active.sub = sub; setHeadingGlobal(title, sub); }
    return;
  }
  leaveChatScreen();
  window.scrollTo(0, 0);
  const saved = getHeadingGlobal();
  setHeadingGlobal(title, sub);
  document.body.classList.add("chat-screen");
  host.classList.add("chat-screen-host");
  // The header's height settles after the new title renders; place again on the next frames and on any resize.
  const again = () => { if (active?.host === host) place(host); };
  const raf = requestAnimationFrame(() => { again(); requestAnimationFrame(again); });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(again) : null;
  ["topbar", "content > main"].forEach((s) => { const n = document.querySelector("." + s); if (n) ro?.observe(n); });
  window.addEventListener("resize", again);
  const gone = window.setInterval(() => { if (!host.isConnected) leaveChatScreen(host); }, 400);
  active = { host, saved, title, sub, stop: () => { cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener("resize", again); window.clearInterval(gone); } };
  place(host);
}

export function leaveChatScreen(host?: HTMLElement) {
  if (!active || (host && active.host !== host)) return;
  const { host: h, saved, title, sub, stop } = active;
  active = null;
  stop();
  h.classList.remove("chat-screen-host");
  document.body.classList.remove("chat-screen");
  const now = getHeadingGlobal();
  if (now.title === title && now.sub === sub) setHeadingGlobal(saved.title, saved.sub);
}
