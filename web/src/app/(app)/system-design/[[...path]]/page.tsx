import { SystemDesignRoute } from "@/features/legacy-routes/SystemDesignRoute";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <SystemDesignRoute view={path.join("/") || "home"} />;
}
