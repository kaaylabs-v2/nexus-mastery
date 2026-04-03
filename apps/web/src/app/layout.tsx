import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { LearnerProvider } from "@/contexts/LearnerContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

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
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
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
