import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import { AuthProvider } from "@/components/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "CreditSense AI",
  description: "Explainable financial-risk intelligence platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)}>
      <body className="flex min-h-screen">
        <AuthProvider>
          <TooltipProvider delay={100}>
            <Sidebar />
            <main className="flex-1 overflow-auto p-6 pt-20 lg:ml-64 lg:pt-6">
              {children}
            </main>
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
