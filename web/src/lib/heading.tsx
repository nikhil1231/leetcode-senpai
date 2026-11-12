"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// The topbar heading: the title doubles as "where am I", the subtitle says what the page is for.
interface Heading { title: string; sub: string }
let globalHeading: (h: Heading) => void = () => {};
// For code outside the React tree (the legacy bridge).
export const setHeadingGlobal = (title: string, sub: string) => globalHeading({ title, sub });
const Ctx = createContext<{ heading: Heading; set: (h: Heading) => void }>({ heading: { title: "", sub: "" }, set: () => {} });

export function HeadingProvider({ children }: { children: ReactNode }) {
  const [heading, set] = useState<Heading>({ title: "Overview", sub: "Interview readiness" });
  useEffect(() => { globalHeading = set; }, [set]);
  return <Ctx.Provider value={{ heading, set }}>{children}</Ctx.Provider>;
}
export const useHeadingValue = () => useContext(Ctx).heading;
export function useHeading(title: string, sub: string) {
  const { set } = useContext(Ctx);
  useEffect(() => { set({ title, sub }); }, [title, sub, set]);
}
