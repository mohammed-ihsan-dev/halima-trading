"use client";

import React, { useState } from "react";
import { Users, Search, Mail, Phone, Building2 } from "lucide-react";
import AdminTable, { Column } from "@/components/admin/AdminTable";
import AdminBadge from "@/components/admin/AdminBadge";

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  totalOrders: number;
  totalSpent: number;
  status: "active" | "vip" | "lead";
}

const mockCustomers: CustomerRecord[] = [
  {
    id: "c1",
    name: "Al Serkal Group",
    email: "procurement@alserkal.ae",
    phone: "+971 50 123 4567",
    company: "Al Serkal Group L.L.C.",
    city: "Abu Dhabi",
    totalOrders: 12,
    totalSpent: 84500,
    status: "vip",
  },
  {
    id: "c2",
    name: "Emirates Contracting",
    email: "orders@emiratescontracting.ae",
    phone: "+971 52 987 6543",
    company: "Emirates Contracting Co.",
    city: "Abu Dhabi",
    totalOrders: 5,
    totalSpent: 32100,
    status: "active",
  },
  {
    id: "c3",
    name: "Mahnoush Hospitality",
    email: "purchasing@mahnoush.ae",
    phone: "+971 56 444 3322",
    company: "Mahnoush Group",
    city: "Abu Dhabi",
    totalOrders: 8,
    totalSpent: 49800,
    status: "vip",
  },
  {
    id: "c4",
    name: "Rashid Al Mansoori",
    email: "ralmansoori@gmail.com",
    phone: "+971 50 888 7766",
    company: "Individual Customer",
    city: "Abu Dhabi",
    totalOrders: 2,
    totalSpent: 4300,
    status: "active",
  },
];

export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");

  const filteredCustomers = mockCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<CustomerRecord>[] = [
    {
      header: "Customer",
      accessorKey: "name",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
            {c.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{c.name}</span>
            <span className="text-xs text-slate-500 block">{c.company}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Contact Info",
      accessorKey: "email",
      cell: (c) => (
        <div className="text-xs space-y-0.5">
          <span className="text-slate-800 font-semibold block">{c.email}</span>
          <span className="text-slate-500 font-mono block">{c.phone}</span>
        </div>
      ),
    },
    {
      header: "City / Region",
      accessorKey: "city",
      cell: (c) => <span className="text-xs font-bold text-slate-700">{c.city}, UAE</span>,
    },
    {
      header: "Orders Placed",
      accessorKey: "totalOrders",
      cell: (c) => (
        <span className="text-xs font-bold text-slate-900">{c.totalOrders} Orders</span>
      ),
    },
    {
      header: "Total Spend",
      accessorKey: "totalSpent",
      cell: (c) => (
        <span className="font-black text-slate-900 text-sm">
          {c.totalSpent.toLocaleString()} AED
        </span>
      ),
    },
    {
      header: "Tier",
      accessorKey: "status",
      cell: (c) =>
        c.status === "vip" ? (
          <AdminBadge variant="primary">VIP Client</AdminBadge>
        ) : (
          <AdminBadge variant="neutral">Active Client</AdminBadge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Directory</h1>
          <p className="text-sm text-slate-500 font-medium">
            Commercial contractors, hospitality accounts, and retail client profiles.
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="relative w-full max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, email, or company name..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-red-500"
          />
        </div>
      </div>

      {/* Customers Table */}
      <AdminTable
        columns={columns}
        data={filteredCustomers}
        keyExtractor={(c) => c.id}
        emptyText="No customer accounts match your search."
      />
    </div>
  );
}
