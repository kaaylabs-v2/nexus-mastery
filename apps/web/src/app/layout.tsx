import type { Metadata } from "next";
// Auth0Provider will be added when real auth is configured
import { Sidebar } from "@/components/layout/sidebar";
// GlobalContextBar removed — was showing generic category data on every page
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { LearnerProvider } from "@/contexts/LearnerContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus Mastery",
  description: "Adaptive mastery learning platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LearnerProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <MobileSidebar />
            <div className="flex flex-1 flex-col lg:pl-56">
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </div>
        </LearnerProvider>
      </body>
    </html>
  );
}
