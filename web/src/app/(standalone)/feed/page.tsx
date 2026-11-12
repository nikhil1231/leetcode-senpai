import type { Metadata } from "next";
import { FeedPage } from "./FeedPage";

export const metadata: Metadata = { title: "Senpai feed" };
export default function Page() { return <FeedPage />; }
