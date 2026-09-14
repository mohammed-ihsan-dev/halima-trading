"use client";

import React, { useState } from "react";
import { FileText, Eye, Printer, Download } from "lucide-react";
import AdminTable, { Column } from "@/components/admin/AdminTable";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  subtotal: number;
  tax: number; // 5% UAE VAT
  total: number;
  currency: string;
  status: "issued" | "paid" | "draft";
  issueDate: string;
  dueDate: string;
}

const mockInvoices: InvoiceRecord[] = [
  {
    id: "inv-1",
    invoiceNumber: "INV-2026-0104",
    orderNumber: "HT-2026-0042",
    customerName: "Al Serkal Group",
    customerAddress: "Electra Street, Abu Dhabi, UAE",
    subtotal: 7095.24,
    tax: 354.76,
    total: 7450,
    currency: "AED",
    status: "paid",
    issueDate: "2026-09-12",
    dueDate: "2026-09-26",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-2026-0103",
    orderNumber: "HT-2026-0040",
    customerName: "Mahnoush Hospitality",
    customerAddress: "Corniche Road, Abu Dhabi, UAE",
    subtotal: 4000,
    tax: 200,
    total: 4200,
    currency: "AED",
    status: "paid",
    issueDate: "2026-09-11",
    dueDate: "2026-09-25",
  },
  {
    id: "inv-3",
    invoiceNumber: "INV-2026-0102",
    orderNumber: "HT-2026-0041",
    customerName: "Emirates Contracting L.L.C.",
    customerAddress: "Musaffah M-14, Abu Dhabi, UAE",
    subtotal: 5542.86,
    tax: 277.14,
    total: 5820,
    currency: "AED",
    status: "issued",
    issueDate: "2026-09-12",
    dueDate: "2026-09-26",
  },
];

export default function AdminInvoicesPage() {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);

  const columns: Column<InvoiceRecord>[] = [
    {
      header: "Invoice #",
      accessorKey: "invoiceNumber",
      cell: (inv) => (
        <span className="font-mono font-bold text-red-600 text-xs block">{inv.invoiceNumber}</span>
      ),
    },
    {
      header: "Order Ref",
      accessorKey: "orderNumber",
      cell: (inv) => <span className="font-mono font-bold text-slate-800 text-xs">{inv.orderNumber}</span>,
    },
    {
      header: "Customer",
      accessorKey: "customerName",
      cell: (inv) => <span className="font-bold text-slate-900">{inv.customerName}</span>,
    },
    {
      header: "Tax (5% VAT)",
      accessorKey: "tax",
      cell: (inv) => <span className="text-xs text-slate-600">{inv.tax} AED</span>,
    },
    {
      header: "Total Amount",
      accessorKey: "total",
      cell: (inv) => (
        <span className="font-black text-slate-900 text-sm">
          {inv.total.toLocaleString()} {inv.currency}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (inv) =>
        inv.status === "paid" ? (
          <AdminBadge variant="success">Paid</AdminBadge>
        ) : (
          <AdminBadge variant="warning">Issued / Due</AdminBadge>
        ),
    },
    {
      header: "Due Date",
      accessorKey: "dueDate",
      cell: (inv) => <span className="text-xs text-slate-500 font-mono">{inv.dueDate}</span>,
    },
    {
      header: "Action",
      cell: (inv) => (
        <button
          onClick={() => setSelectedInvoice(inv)}
          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
        >
          <Eye size={14} /> Preview Invoice
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Invoice Management</h1>
          <p className="text-sm text-slate-500 font-medium">
            Commercial tax invoices (5% UAE VAT compliant).
          </p>
        </div>
      </div>

      {/* Invoices Table */}
      <AdminTable
        columns={columns}
        data={mockInvoices}
        keyExtractor={(inv) => inv.id}
        emptyText="No invoices generated yet."
      />

      {/* Invoice Preview Modal */}
      {selectedInvoice && (
        <AdminModal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title={`Tax Invoice ${selectedInvoice.invoiceNumber}`}
          subtitle={`Issued on ${selectedInvoice.issueDate}`}
          maxWidth="xl"
        >
          <div className="space-y-6 text-slate-900">
            {/* Invoice Print Container */}
            <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-6 shadow-sm">
              {/* Header */}
              <div className="flex justify-between items-start pb-6 border-b border-slate-200">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-red-600 text-white font-black text-xl flex items-center justify-center mb-2">
                    HT
                  </div>
                  <h2 className="font-extrabold text-base text-slate-900">Halima Trading L.L.C.</h2>
                  <p className="text-xs text-slate-500">Al Hamra Plaza Hotel Building, Electra Street</p>
                  <p className="text-xs text-slate-500">Abu Dhabi, United Arab Emirates</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">TRN / VAT: 100293848100003</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black uppercase tracking-widest text-red-600 block mb-1">
                    TAX INVOICE
                  </span>
                  <span className="text-sm font-mono font-bold block">{selectedInvoice.invoiceNumber}</span>
                  <span className="text-xs text-slate-500 block mt-1">Order Ref: {selectedInvoice.orderNumber}</span>
                  <span className="text-xs text-slate-500 block">Due Date: {selectedInvoice.dueDate}</span>
                </div>
              </div>

              {/* Billed To */}
              <div className="bg-slate-50 p-4 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Billed To</span>
                <span className="font-extrabold text-slate-900 text-sm block">{selectedInvoice.customerName}</span>
                <span className="text-slate-600 block">{selectedInvoice.customerAddress}</span>
              </div>

              {/* Calculation Summary */}
              <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Subtotal (Excl. VAT)</span>
                  <span className="font-mono">{selectedInvoice.subtotal.toFixed(2)} AED</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>UAE VAT (5%)</span>
                  <span className="font-mono">{selectedInvoice.tax.toFixed(2)} AED</span>
                </div>
                <div className="flex justify-between py-2 text-sm font-black text-slate-900 border-t border-slate-200">
                  <span>Total Amount Payable</span>
                  <span className="font-mono text-red-600">{selectedInvoice.total.toFixed(2)} AED</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => alert("Printing functionality ready for PDF generation")}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2"
              >
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
