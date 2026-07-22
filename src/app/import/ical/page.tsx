import { redirect } from "next/navigation";

export default function LegacyIcalImportPage() {
  redirect("/imports?source=ical");
}
