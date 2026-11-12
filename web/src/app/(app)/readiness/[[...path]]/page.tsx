import { ReadinessPage } from "@/features/readiness/ReadinessPage";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <ReadinessPage view={path[0] ?? "home"} />;
}
