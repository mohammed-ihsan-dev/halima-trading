"use client";

import React, { useState } from "react";
import { Plus, Award, Check, X, Search } from "lucide-react";
import AdminTable, { Column } from "@/components/admin/AdminTable";
import AdminModal from "@/components/admin/AdminModal";
import AdminBadge from "@/components/admin/AdminBadge";

interface BrandRecord {
  id: string;
  name: string;
  slug: string;
  status: "active" | "partner";
  productCount: number;
}

const mockBrands: BrandRecord[] = [
  { id: "b1", name: "Hisense", slug: "hisense", status: "partner", productCount: 14 },
  { id: "b2", name: "Super General", slug: "super-general", status: "partner", productCount: 18 },
  { id: "b3", name: "Midea", slug: "midea", status: "partner", productCount: 12 },
  { id: "b4", name: "O General", slug: "o-general", status: "partner", productCount: 9 },
  { id: "b5", name: "LG Electronics", slug: "lg", status: "partner", productCount: 16 },
  { id: "b6", name: "Samsung", slug: "samsung", status: "partner", productCount: 15 },
  { id: "b7", name: "Hitachi", slug: "hitachi", status: "partner", productCount: 8 },
  { id: "b8", name: "Panasonic", slug: "panasonic", status: "partner", productCount: 10 },
  { id: "b9", name: "Toshiba", slug: "toshiba", status: "partner", productCount: 7 },
  { id: "b10", name: "Beko", slug: "beko", status: "partner", productCount: 11 },
  { id: "b11", name: "Bosch", slug: "bosch", status: "partner", productCount: 6 },
  { id: "b12", name: "Haier", slug: "haier", status: "partner", productCount: 13 },
  { id: "b13", name: "Nikai", slug: "nikai", status: "partner", productCount: 10 },
  { id: "b14", name: "Rheem", slug: "rheem", status: "partner", productCount: 5 },
  { id: "b15", name: "Westpoint", slug: "westpoint", status: "partner", productCount: 8 },
  { id: "b16", name: "Carrier", slug: "carrier", status: "partner", productCount: 6 },
  { id: "b17", name: "Trane", slug: "trane", status: "partner", productCount: 4 },
  { id: "b18", name: "Gree", slug: "gree", status: "partner", productCount: 9 },
  { id: "b19", name: "AUX", slug: "aux", status: "partner", productCount: 7 },
  { id: "b20", name: "Ariston", slug: "ariston", status: "partner", productCount: 5 },
];

export default function AdminBrandsPage() {
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState("");
  const [brandName, setBrandName] = useState("");

  const filteredBrands = mockBrands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    setNotification(`Brand "${brandName}" staged for Cloudflare D1 integration.`);
    setTimeout(() => setNotification(""), 4000);
    setBrandName("");
  };

  const columns: Column<BrandRecord>[] = [
    {
      header: "Brand Name",
      accessorKey: "name",
      cell: (b) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-red-600 font-black shrink-0">
            {b.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{b.name}</span>
            <span className="text-xs font-mono text-slate-400 block">/brands/{b.slug}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: () => <AdminBadge variant="success">Authorized Partner</AdminBadge>,
    },
    {
      header: "Active Listings",
      accessorKey: "productCount",
      cell: (b) => (
        <span className="text-xs font-bold text-slate-700">{b.productCount} Products</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Brand Directory Management</h1>
          <p className="text-sm text-slate-500 font-medium">
            30+ trusted global electronics & home appliance manufacturers.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-md shadow-red-600/20 transition-all"
        >
          <Plus size={18} /> Add Brand
        </button>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification("")} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="relative w-full max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand name..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
          />
        </div>
      </div>

      {/* Brands Table */}
      <AdminTable
        columns={columns}
        data={filteredBrands}
        keyExtractor={(b) => b.id}
      />

      {/* Add Brand Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Partner Brand"
        subtitle="Register new appliance manufacturer"
      >
        <form onSubmit={handleAddBrand} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Brand Name</label>
            <input
              type="text"
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Panasonic, Hitachi"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20"
            >
              Save Brand Record
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
