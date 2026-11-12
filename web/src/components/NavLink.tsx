"use client";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "@/lib/navigate";

// A link that works in any React tree (including the small ones mounted into legacy views): plain <a>, client-side on click.
export function NavLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest} onClick={(e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault(); navigate(href);
  }} />;
}
