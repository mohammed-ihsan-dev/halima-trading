"use client";

import React, { useState } from "react";
import { Plus, FolderTree, Edit, Check, X } from "lucide-react";
import AdminTable, { Column } from "@/components/admin/AdminTable";
import AdminModal from "@/components/admin/AdminModal";
import { applianceCategories, ApplianceCategory } from "@/data/applianceCategories";

export default function AdminCategoriesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    setNotification(`Category "${categoryName}" staged for Cloudflare D1 integration.`);
    setTimeout(() => setNotification(""), 4000);
    setCategoryName("");
    setCategorySlug("");
    setCategoryDescription("");
  };

  const columns: Column<ApplianceCategory>[] = [
    {
      header: "Category",
      accessorKey: "title",
      cell: (cat) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 font-bold shrink-0">
            <FolderTree size={20} />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{cat.title}</span>
            <span className="text-xs font-mono text-slate-400 block">/categories/{cat.id}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Description",
      accessorKey: "description",
      cell: (cat) => (
        <span className="text-xs text-slate-600 line-clamp-2 max-w-md block">
          {cat.description}
        </span>
      ),
    },
    {
      header: "Catalog Items",
      accessorKey: "productCount",
      cell: (cat) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
          {cat.productCount} Products
        </span>
      ),
    },
    {
      header: "Actions",
      cell: (cat) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCategoryName(cat.title);
              setCategorySlug(cat.id);
              setCategoryDescription(cat.description);
              setIsModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Edit Category"
          >
            <Edit size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Category Management</h1>
          <p className="text-sm text-slate-500 font-medium">
            Manage product categories and subcategory taxonomies.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-md shadow-red-600/20 transition-all"
        >
          <Plus size={18} /> Add Category
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

      {/* Categories Table */}
      <AdminTable
        columns={columns}
        data={applianceCategories}
        keyExtractor={(c) => c.id}
      />

      {/* Add / Edit Category Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Category Manager"
        subtitle="Configure appliance category classification"
      >
        <form onSubmit={handleAddCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category Title</label>
            <input
              type="text"
              required
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setCategorySlug(e.target.value.toLowerCase().replaceAll(" ", "-"));
              }}
              placeholder="e.g. Air Conditioning"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">URL Slug</label>
            <input
              type="text"
              required
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              placeholder="air-conditioning"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-hidden focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
            <textarea
              rows={3}
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              placeholder="Category overview and appliance scope..."
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
              Save Category Record
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
