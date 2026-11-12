import { redirect } from "next/navigation";

// The app opens on Overview.
export default function Home() {
  redirect("/readiness");
}
