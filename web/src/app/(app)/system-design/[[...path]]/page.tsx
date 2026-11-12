import { SystemDesignRoute } from "@/features/legacy-routes/SystemDesignRoute";
import { PrinciplesPage } from "@/features/system-design/PrinciplesPage";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path.join("/") === "principles") return <PrinciplesPage />;
  return <SystemDesignRoute view={path.join("/") || "home"} />;
}
