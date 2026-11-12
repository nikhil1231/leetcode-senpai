import type { Metadata } from "next";
import { WalkPage } from "./WalkPage";

export const metadata: Metadata = { title: "Senpai walk" };
export default function Page() { return <WalkPage />; }
