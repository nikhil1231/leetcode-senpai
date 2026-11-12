import { SPRITE } from "@/lib/icons";

// The sprite is rendered once in the shell; <Icon id="i-today" /> points at it.
export function IconSprite() {
  return (
    <svg className="icon-defs" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(SPRITE).map(([id, inner]) => <g key={id} id={id} dangerouslySetInnerHTML={{ __html: inner }} />)}
      </defs>
    </svg>
  );
}

export function Icon({ id, className = "nav-icon" }: { id: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><use href={`#${id}`} /></svg>;
}
