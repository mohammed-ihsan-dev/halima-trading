"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { User, Mail, ShieldCheck, Phone, Calendar, LogOut, CheckCircle2 } from "lucide-react";
import AdminModal from "./AdminModal";
import AdminBadge from "./AdminBadge";

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminProfileModal({ isOpen, onClose }: AdminProfileModalProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    onClose();
    router.push("/admin/login");
  };

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title="Admin Profile & Account" subtitle="Super Administrator Session">
      <div className="space-y-6 pt-1">
        {/* User Card Header */}
        <div className="bg-slate-950 text-white rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-600 text-white font-black text-xl flex items-center justify-center border-2 border-red-500 shadow-md shrink-0">
            A
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-white text-base">Admin</h3>
              <AdminBadge variant="success">ACTIVE</AdminBadge>
            </div>
            <span className="text-xs font-bold text-red-400 block mt-0.5">Super Administrator</span>
            <span className="text-[11px] text-slate-400 font-mono block">Halima Trading L.L.C.</span>
          </div>
        </div>

        {/* Profile Details List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3.5 text-xs md:text-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-slate-500 font-semibold flex items-center gap-2">
              <Mail size={15} className="text-slate-400" /> Email Address
            </span>
            <span className="font-bold text-slate-900 font-mono">admin@halimatrading.ae</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-slate-500 font-semibold flex items-center gap-2">
              <Phone size={15} className="text-slate-400" /> Direct Contact
            </span>
            <span className="font-bold text-slate-900 font-mono">+971 4 223 4567</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-slate-500 font-semibold flex items-center gap-2">
              <ShieldCheck size={15} className="text-slate-400" /> Role & Scope
            </span>
            <span className="font-bold text-slate-900">Full System Access</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-semibold flex items-center gap-2">
              <Calendar size={15} className="text-slate-400" /> Joined Date
            </span>
            <span className="font-bold text-slate-900">12 August 2026</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs md:text-sm rounded-xl transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all"
          >
            <LogOut size={16} /> Logout Session
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
