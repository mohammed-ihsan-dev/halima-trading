"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Server,
  KeyRound,
  Sparkles,
} from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("admin@halimatrading.com");
  const [password, setPassword] = useState("HalimaAdmin2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loginEmail = email.trim();
      const loginPassword = password;

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(data.error || "Invalid email or password. Please try again.");
      }
    } catch {
      setError("Network connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = () => {
    setEmail("admin@halimatrading.com");
    setPassword("HalimaAdmin2026!");
    setError("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden selection:bg-red-600 selection:text-white">
      {/* Background Decorative Ambient Light Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-slate-800/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* Main Glass Card Container */}
      <div className="w-full max-w-5xl bg-slate-900/80 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-slate-800/80 relative z-10 min-h-[580px]">
        {/* Left Side: Brand Hero Panel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 sm:p-10 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-slate-800/60 overflow-hidden">
          {/* Top Brand Logo */}
          <div className="flex items-center gap-3.5 z-10">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-700 to-red-500 flex items-center justify-center text-white font-black italic tracking-tighter text-2xl shadow-lg shadow-red-900/50 border border-red-400/30">
              H
            </div>
            <div>
              <span className="font-black text-white text-lg tracking-wider block leading-tight">
                HALIMA
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-500 block">
                TRADING L.L.C.
              </span>
            </div>
          </div>

          {/* Middle Value Pitch */}
          <div className="my-auto py-8 z-10 space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-800/50 text-red-400 text-[11px] font-bold mb-3">
                <Sparkles size={13} /> Management Portal
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                Control your enterprise inventory & operations.
              </h2>
              <p className="text-xs text-slate-400 font-medium leading-relaxed mt-2">
                Access product catalog management, order fulfillment tracking, customer accounts, and real-time MongoDB analytics.
              </p>
            </div>

            {/* Feature Highlights List */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300">
                <div className="w-5 h-5 rounded-md bg-emerald-950 border border-emerald-800/60 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={13} />
                </div>
                <span>MongoDB Atlas Real-time Persistence</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300">
                <div className="w-5 h-5 rounded-md bg-emerald-950 border border-emerald-800/60 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={13} />
                </div>
                <span>PBKDF2 Password Hash Security</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300">
                <div className="w-5 h-5 rounded-md bg-emerald-950 border border-emerald-800/60 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={13} />
                </div>
                <span>Instant ISR Cache Invalidation</span>
              </div>
            </div>
          </div>

          {/* Bottom Live System Indicator */}
          <div className="z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-emerald-400" />
              <span>System Status</span>
            </div>
            <span className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[11px] bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/40">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Mongo Atlas Active
            </span>
          </div>

          {/* Decorative Corner Ribbon */}
          <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Right Side: Clean Modern Form Panel */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-slate-900/90">
          <div className="max-w-md mx-auto w-full space-y-6">
            <div>
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800/50 text-red-500 flex items-center justify-center mb-3">
                <ShieldCheck size={22} />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">Admin Sign In</h1>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Enter your administrative credentials to access the dashboard.
              </p>
            </div>

            {/* Error Notification Alert */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs font-semibold flex items-center gap-3 animate-fadeIn">
                <AlertCircle size={18} className="shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Sign In Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@halimatrading.com"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white font-semibold placeholder-slate-500 focus:outline-hidden focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-xs text-white font-semibold placeholder-slate-500 focus:outline-hidden focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Demo Credentials Quick Pre-fill Pill */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <KeyRound size={14} className="text-amber-400" />
                  <span className="text-[11px] font-semibold">Demo Credentials Available</span>
                </div>
                <button
                  type="button"
                  onClick={setDemoCredentials}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-extrabold hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  Auto-fill Demo
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-red-900/40 transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Signing in to Dashboard...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Admin Portal</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
