import type { Metadata } from "next";
import { WallPage } from "./WallPage";

export const metadata: Metadata = { title: "Senpai wall" };
export default function Page() { return <WallPage />; }
