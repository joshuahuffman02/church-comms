import type { Metadata } from "next";
import "./globals.css";
import { sans } from "./font";
import { Nav } from "@/components/nav";
import { CalendarImportToast } from "@/components/calendar-import-toast";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Church Comms",
  description: "Church communications planning and production board",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-screen lg:flex">
        {session ? <Nav /> : null}
        <main key="page" className="min-w-0 flex-1 p-4 sm:p-6 float-in">{children}</main>
        {session ? <CalendarImportToast /> : null}
      </body>
    </html>
  );
}
