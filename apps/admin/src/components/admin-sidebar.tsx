"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, GraduationCap, Upload,
  Users, BarChart3, Settings, LogOut, Sparkles,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/users", label: "Learners", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-sidebar-border bg-sidebar-background flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          N
        </div>
        <div>
          <span className="font-display text-sm font-semibold text-foreground">Nexus</span>
          <span className="text-[11px] text-muted-foreground align-super ml-0.5">²</span>
          <span className="ml-1.5 text-xs text-muted-foreground">Studio</span>
        </div>
      </div>

      {/* Create CTA */}
      <div className="px-3 pt-1 pb-2">
        <Link href="/upload">
          <div className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
            pathname === "/upload"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-primary/10 text-primary hover:bg-primary/15"
          )}>
            <Sparkles className="h-[18px] w-[18px] shrink-0" />
            Create Course
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User / Sign out */}
      <div className="mt-auto border-t border-sidebar-border p-3">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-foreground truncate">Admin</p>
          <p className="text-xs text-muted-foreground truncate">Organization Admin</p>
        </div>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors">
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
