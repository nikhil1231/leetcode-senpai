import { LeetcodeRoute } from "@/features/leetcode/LeetcodeRoute";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <LeetcodeRoute tab={path[0] ?? "today"} rest={path.slice(1)} />;
}
