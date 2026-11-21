import { notFound } from "next/navigation";
import { CodingPage } from "@/features/coding/CodingPage";
import { TrackRoute } from "@/features/legacy-routes/TrackRoute";

const TRACKS = ["fundamentals", "ai", "experience", "practical"];

export default async function Page({ params }: { params: Promise<{ track: string; path?: string[] }> }) {
  const { track, path = [] } = await params;
  if (!TRACKS.includes(track)) notFound();
  if (track === "practical" && path[0] === "coding") return <CodingPage />;
  return <TrackRoute track={track} view={path.join("/") || "home"} />;
}
