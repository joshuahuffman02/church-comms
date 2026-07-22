import { redirect } from "next/navigation";

export default function LegacyGoogleImportPage() {
  redirect("/imports?source=google");
}
