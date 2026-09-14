import React from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard | Halima Trading L.L.C.",
  description: "Management portal for products, orders, categories, invoices and settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
