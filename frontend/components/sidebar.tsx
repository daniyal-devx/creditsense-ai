"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  FileText,
  Bot,
  ShieldAlert,
  BarChart3,
  ClipboardList,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/fraud", label: "Fraud Queue", icon: ShieldAlert },
  { href: "/model", label: "Model Metrics", icon: BarChart3 },
  { href: "/copilot", label: "AI Copilot", icon: Bot },
  { href: "/admin/audit", label: "Audit Log", icon: ClipboardList },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-navy-900 border-r border-navy-700 flex flex-col z-50">
      <div className="p-6 border-b border-navy-700">
        <Link href="/dashboard" className="block">
          <h1 className="text-xl font-bold text-white tracking-tight">
            CreditSense <span className="text-blue-400">AI</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Risk Intelligence Platform</p>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-blue-600/20 text-blue-300 font-medium"
                  : "text-slate-400 hover:bg-navy-800 hover:text-slate-200"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-navy-700 space-y-3">
        {user && (
          <div className="px-3">
            <p className="text-sm font-medium text-white truncate">{user.email}</p>
            <p className="text-xs text-slate-500">
              {(user.app_metadata?.role as string) || "LOAN_OFFICER"}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-navy-800"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
        <div className="text-xs text-slate-600 px-3">v1.0.0 — Hackathon MVP</div>
      </div>
    </aside>
  );
}
