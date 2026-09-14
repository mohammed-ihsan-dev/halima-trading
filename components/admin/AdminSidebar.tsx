"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  CreditCard,
  BarChart3,
  LogOut,
  X,
} from "lucide-react";

interface AdminSidebarProps {
  onCloseMobile?: () => void;
}

export default function AdminSidebar({ onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/admin/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Products", href: "/admin/products", icon: Package },
    { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Payments", href: "/admin/payments", icon: CreditCard },
    { label: "Analysis", href: "/admin/analysis", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col h-full border-r border-slate-900 select-none">
      {/* Official Halima Trading Logo Header - Scaled & Responsive */}
      <div className="p-5 md:p-6 flex items-center justify-between border-b border-slate-900/80 w-full overflow-hidden shrink-0">
        <Link href="/admin" className="flex items-center flex-1 min-w-0 pr-2 group">
          <img
            src="/halima-logo-with-text-footer.png"
            alt="Halima Trading L.L.C."
            className="w-full h-auto max-h-14 md:max-h-16 object-contain object-left transition-all duration-200 group-hover:scale-102"
          />
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-900 shrink-0"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3.5 py-6 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-extrabold transition-all ${
                isActive
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/80"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Logout Footer */}
      <div className="p-4 border-t border-slate-900/80 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-extrabold text-slate-400 hover:text-white hover:bg-slate-900/80 transition-colors cursor-pointer"
        >
          <LogOut size={18} className="text-slate-400" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
