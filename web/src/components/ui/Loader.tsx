import type { ReactNode } from "react";

export function Loader({ message = "Loading…" }: { message?: string }) {
  return <div className="loading-block"><span className="spinner" /><span>{message}</span></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

// A stuck loader is replaced with a retry when a read fails. A 503 is the server saying it is offline.
export function LoadError({ error, retry }: { error?: unknown; retry?: () => void }) {
  const status = (error as { status?: number } | undefined)?.status;
  const offline = status === 503;
  return (
    <div className="empty load-error">
      <p>{offline ? (error as Error).message : "Couldn't reach the server. It may be restarting."}</p>
      {retry && <button className="button is-small retry-load" onClick={retry}>Retry</button>}
    </div>
  );
}
