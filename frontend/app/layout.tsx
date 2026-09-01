import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/sidebar";

export const metadata: Metadata = {
  title: "CreditSense AI",
  description: "Explainable financial-risk intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-navy-950 text-slate-200">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6 ml-64">{children}</main>
      </body>
    </html>
  );
}
