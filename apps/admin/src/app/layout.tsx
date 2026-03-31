import type { Metadata } from "next";
import { AdminSidebar } from "@/components/admin-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus Admin Studio",
  description: "Admin dashboard for Nexus Mastery platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
