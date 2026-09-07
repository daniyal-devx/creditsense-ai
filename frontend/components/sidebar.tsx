"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  FileText,
  Bot,
  BarChart3,
  LogOut,
  Menu,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/model", label: "Model Metrics", icon: BarChart3 },
  { href: "/copilot", label: "AI Copilot", icon: Bot },
  // Fraud Queue and Audit Log are Wave 2 features; hidden for the MVP demo.
  // { href: "/fraud", label: "Fraud Queue", icon: ShieldAlert },
  // { href: "/admin/audit", label: "Audit Log", icon: ClipboardList },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const { user, signOut } = useAuth();
  const role = (user?.app_metadata?.role as string) || "LOAN_OFFICER";
  const roleLabel = role
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="border-t border-sidebar-border p-4">
      {user && (
        <div className="mb-3 px-3">
          <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="w-full justify-start text-muted-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
      <p className="mt-3 px-3 text-xs text-muted-foreground/70">v1.0.0</p>
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading font-semibold tracking-tight text-sidebar-foreground", className)}>
      CreditSense <span className="text-primary">AI</span>
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border p-6">
          <Link
            href="/dashboard"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <BrandMark className="text-lg" />
            <p className="mt-0.5 text-xs text-muted-foreground">
              Risk Intelligence Platform
            </p>
          </Link>
        </div>
        <NavLinks pathname={pathname} />
        <SidebarFooter />
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={(open) => setMobileOpen(open)}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 p-0">
            <SheetHeader className="border-b border-sidebar-border">
              <SheetTitle>
                <BrandMark className="text-base font-medium" />
              </SheetTitle>
            </SheetHeader>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter />
          </SheetContent>
        </Sheet>
        <Link href="/dashboard">
          <BrandMark className="text-base" />
        </Link>
      </header>
    </>
  );
}
