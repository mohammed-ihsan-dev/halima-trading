"use client";

import React, { useState } from "react";
import { Menu, Search, Bell, ChevronDown } from "lucide-react";
import AdminProfileModal from "./AdminProfileModal";

interface AdminHeaderProps {
  onToggleMobileSidebar: () => void;
}

export default function AdminHeader({ onToggleMobileSidebar }: AdminHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 md:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Mobile Menu & Search Input */}
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <button
            onClick={onToggleMobileSidebar}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Open sidebar menu"
          >
            <Menu size={20} />
          </button>

          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search anything..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Right: Notifications & Clickable Admin Profile */}
        <div className="flex items-center gap-4">
          {/* Notification Bell Icon */}
          <button
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 text-[10px] font-black text-white flex items-center justify-center border-2 border-white">
              4
            </span>
          </button>

          {/* Interactive User Profile */}
          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-3 pl-3 border-l border-slate-200/80 hover:opacity-85 transition-opacity cursor-pointer text-left"
            aria-label="Admin Profile Menu"
          >
            <div className="w-9 h-9 rounded-full bg-red-600 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
              A
            </div>
            <div className="hidden md:block text-left leading-tight">
              <span className="text-xs font-extrabold text-slate-900 block">Admin</span>
              <span className="text-[10px] font-semibold text-slate-400 block">Super Admin</span>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden md:block" />
          </button>
        </div>
      </header>

      {/* Admin Profile Modal */}
      <AdminProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
