import { SystemDesignRoute } from "@/features/legacy-routes/SystemDesignRoute";
import { PrinciplesPage } from "@/features/system-design/PrinciplesPage";

export default async function Page({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<{ session?: string }> }) {
  const { path = [] } = await params;
  if (path.join("/") === "principles") return <PrinciplesPage />;
  const { session } = await searchParams;
  return <SystemDesignRoute view={path.join("/") || "home"} sessionId={session} />;
}
