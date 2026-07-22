import { redirect } from "next/navigation";

export default function LegacyPlanningCenterImportPage() {
  redirect("/imports?source=planning-center");
}
