"use client";

import React, { useState } from "react";
import { Settings, ShieldCheck, Database, Save, Check, KeyRound, Globe, Building2 } from "lucide-react";

export default function AdminSettingsPage() {
  const [companyName, setCompanyName] = useState("Halima Trading L.L.C.");
  const [address, setAddress] = useState("Al Hamra Plaza Hotel Building, Electra Street, Abu Dhabi, UAE");
  const [phone, setPhone] = useState("+971 56 568 5090");
  const [email, setEmail] = useState("Halimatradingest@gmail.com");
  const [trn, setTrn] = useState("100293848100003");
  const [currency, setCurrency] = useState("AED");
  const [vatRate, setVatRate] = useState("5");
  const [saved, setSaved] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">System & Store Settings</h1>
          <p className="text-sm text-slate-500 font-medium">
            Manage company profile, tax configuration, and admin security settings.
          </p>
        </div>
      </div>

      {saved && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check size={18} className="text-emerald-600" />
          <span>Store settings updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Company Profile */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Company Details & Tax Information</h2>
              <p className="text-xs text-slate-500">Commercial entity information displayed on quotations & invoices</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">TRN / Tax Registration #</label>
              <input
                type="text"
                value={trn}
                onChange={(e) => setTrn(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Support Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 uppercase mb-1">Physical Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Regional & Currency Configuration */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Regional & Tax Rates</h2>
              <p className="text-xs text-slate-500">Default currency, UAE VAT rate, and timezone</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Base Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-hidden focus:border-red-500"
              >
                <option value="AED">AED - United Arab Emirates Dirham</option>
                <option value="USD">USD - US Dollar</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">UAE VAT Rate (%)</label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Timezone</label>
              <input
                type="text"
                disabled
                value="Asia/Dubai (GST +04:00)"
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Database & Cloudflare Infrastructure */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center font-bold border border-red-500/30">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Database & Infrastructure Status</h2>
              <p className="text-xs text-slate-400">Cloudflare Worker + D1 Database + Drizzle ORM bindings</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 block">D1 DATABASE BINDING</span>
              <span className="text-emerald-400 font-bold block">`env.DB` Configured</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 block">ADMIN AUTHENTICATION</span>
              <span className="text-emerald-400 font-bold block">HttpOnly Session Cookie</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-600/20 inline-flex items-center gap-2 transition-all"
          >
            <Save size={18} /> Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
