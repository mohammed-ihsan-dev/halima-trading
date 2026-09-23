"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Copy,
  Check,
  Share2,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  Loader2,
  Package,
  Building,
  Mail,
  Phone,
  MapPin,
  FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { companyContact } from "@/lib/company-config";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockCount: number;
  inStock: boolean;
  image?: string;
}

interface SelectedItem {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  stockCount: number;
  total: number;
}

export default function CreateExternalOrderPage() {
  const router = useRouter();

  // Form input state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Abu Dhabi");
  const [emirate, setEmirate] = useState("Abu Dhabi");
  const [country, setCountry] = useState("UAE");
  const [customerNotes, setCustomerNotes] = useState("");

  // Product selection state
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state after creation
  const [createdOrder, setCreatedOrder] = useState<{
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    subtotal: number;
    vat: number;
    paymentLinkUrl: string;
    paymentStatus: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  // Fetch product catalog for selection
  useEffect(() => {
    async function loadProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (res.ok && data.success) {
          setAvailableProducts(data.products || data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch product catalog:", err);
      } finally {
        setLoadingProducts(false);
      }
    }
    loadProducts();
  }, []);

  const filteredProducts = availableProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleAddProduct = (prod: Product) => {
    const existingIndex = selectedItems.findIndex((item) => item.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      const currentQty = updated[existingIndex].quantity;
      if (prod.stockCount !== undefined && currentQty >= prod.stockCount) {
        alert(`Cannot add more than available stock (${prod.stockCount}).`);
        return;
      }
      updated[existingIndex].quantity += 1;
      updated[existingIndex].total = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setSelectedItems(updated);
    } else {
      if (!prod.inStock || (prod.stockCount !== undefined && prod.stockCount <= 0)) {
        alert("Product is out of stock.");
        return;
      }
      setSelectedItems([
        ...selectedItems,
        {
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          unitPrice: prod.price,
          quantity: 1,
          stockCount: prod.stockCount || 99,
          total: prod.price,
        },
      ]);
    }
  };

  const handleQuantityChange = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const qty = Math.min(newQty, item.stockCount);
          return {
            ...item,
            quantity: qty,
            total: qty * item.unitPrice,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Calculations
  const calculatedSubtotal = selectedItems.reduce((acc, item) => acc + item.total, 0);
  const calculatedVat = Math.round(calculatedSubtotal * 0.05 * 100) / 100;
  const calculatedTotal = calculatedSubtotal + calculatedVat;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim() || !customerEmail.trim() || !customerPhone.trim()) {
      setError("Please fill in Customer Name, Email, and Phone Number.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("Please select at least one product for the order.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          company: company.trim(),
          shippingAddress: {
            address: address.trim() || "Offline Sales Order",
            city,
            emirate,
            country,
          },
          customerNotes: customerNotes.trim(),
          items: selectedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCreatedOrder({
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          totalAmount: data.totalAmount,
          subtotal: data.subtotal,
          vat: data.vat,
          paymentLinkUrl: data.paymentLinkUrl,
          paymentStatus: data.paymentStatus,
        });
      } else {
        setError(data.error || "Failed to create external order.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while creating external order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdOrder?.paymentLinkUrl) return;
    navigator.clipboard.writeText(createdOrder.paymentLinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getWhatsAppShareUrl = () => {
    if (!createdOrder) return "#";
    const cleanPhone = customerPhone.replace(/[^\d]/g, "");
    const message = `Hello ${createdOrder.orderNumber ? customerName : "Customer"},

Your ${companyContact.name} order [${createdOrder.orderNumber}] has been created.

Order Total: AED ${createdOrder.totalAmount.toLocaleString()} (incl. 5% VAT)

Please complete your payment using this secure Stripe payment link:
${createdOrder.paymentLinkUrl}

Thank you for choosing ${companyContact.shortName}.`;

    const encodedMessage = encodeURIComponent(message);
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedMessage}` : `https://wa.me/?text=${encodedMessage}`;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">Create External Order</h1>
            <p className="text-xs md:text-sm font-semibold text-slate-500">
              Create offline/WhatsApp orders and generate Stripe Payment Links for customers.
            </p>
          </div>
        </div>
      </div>

      {/* Success View after Order Creation */}
      {createdOrder ? (
        <div className="bg-white rounded-2xl border border-emerald-200 p-6 md:p-8 shadow-md space-y-6">
          <div className="flex items-center gap-4 text-emerald-700 border-b border-emerald-100 pb-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Order & Stripe Payment Link Created
              </span>
              <h2 className="text-2xl font-black text-slate-900">
                Order #{createdOrder.orderNumber}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-400 block font-semibold">Customer</span>
              <strong className="text-slate-900 text-sm">{customerName}</strong>
              <span className="block text-slate-500">{customerEmail}</span>
              <span className="block text-slate-500">{customerPhone}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold">Total Amount</span>
              <strong className="text-red-600 text-base font-black">
                {formatCurrency(createdOrder.totalAmount)}
              </strong>
              <span className="block text-slate-500">(Subtotal: {formatCurrency(createdOrder.subtotal)} + VAT: {formatCurrency(createdOrder.vat)})</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold">Payment Status</span>
              <span className="inline-block px-2.5 py-1 rounded-md text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 mt-1">
                PENDING PAYMENT
              </span>
            </div>
          </div>

          {/* Generated Payment Link Actions */}
          <div className="bg-slate-950 text-white rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-500">
                <CreditCard className="w-5 h-5" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">Stripe Payment Link</h3>
              </div>
              <span className="text-xs text-slate-400">Share with customer to collect payment</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-3">
              <input
                type="text"
                readOnly
                value={createdOrder.paymentLinkUrl}
                className="bg-transparent text-xs font-mono text-slate-200 w-full focus:outline-none select-all"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleCopyLink}
                className="btn primary px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Payment link copied." : "Copy Payment Link"}</span>
              </button>

              <a
                href={getWhatsAppShareUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Send via WhatsApp</span>
              </a>

              <button
                onClick={() => {
                  setCreatedOrder(null);
                  setSelectedItems([]);
                  setCustomerName("");
                  setCustomerEmail("");
                  setCustomerPhone("");
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors ml-auto cursor-pointer"
              >
                Create Another Order
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitOrder} className="space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Customer Information */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-red-600" /> Customer Information
                </h2>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al Serkal Construction"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. procurement@alserkal.ae"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +971 50 123 4567"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    placeholder="e.g. Al Serkal Group"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-600" /> Delivery Address
                </h2>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Electra Street, Building 4"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Emirate</label>
                    <select
                      value={emirate}
                      onChange={(e) => {
                        setEmirate(e.target.value);
                        setCity(e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500"
                    >
                      {["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"].map((em) => (
                        <option key={em} value={em}>
                          {em}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Country</label>
                    <input
                      type="text"
                      readOnly
                      value={country}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Phone order received via sales team..."
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Right Col: Product Selection & Pricing */}
            <div className="lg:col-span-2 space-y-6">
              {/* Product Search Catalog */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Package className="w-4 h-4 text-red-600" /> Select Products from Catalog
                  </h2>
                  <span className="text-xs text-slate-400 font-medium">Server prices strictly enforced</span>
                </div>

                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search catalog by product name or SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                {loadingProducts ? (
                  <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-red-600" /> Loading product catalog...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No products found.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200/80 rounded-xl">
                    {filteredProducts.slice(0, 10).map((prod) => (
                      <div
                        key={prod.id}
                        className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-xs"
                      >
                        <div className="min-w-0 pr-3">
                          <span className="font-bold text-slate-900 block truncate">{prod.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">SKU: {prod.sku} · Stock: {prod.stockCount ?? "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-extrabold text-slate-900">{formatCurrency(prod.price)}</span>
                          <button
                            type="button"
                            onClick={() => handleAddProduct(prod)}
                            disabled={!prod.inStock}
                            className="btn primary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          >
                            <Plus size={14} /> Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Items Table & Totals */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100">
                  Order Line Items ({selectedItems.length})
                </h2>

                {selectedItems.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-2">
                    <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">No items selected yet.</p>
                    <p className="text-[11px] text-slate-400">Search and add products from the catalog above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
                      {selectedItems.map((item) => (
                        <div key={item.productId} className="p-3 bg-white flex items-center justify-between gap-4 text-xs">
                          <div className="flex-1 min-w-0">
                            <strong className="text-slate-900 block truncate">{item.name}</strong>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Unit Price: {formatCurrency(item.unitPrice)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-400">Qty:</label>
                            <input
                              type="number"
                              min={1}
                              max={item.stockCount}
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value, 10) || 1)}
                              className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold text-slate-800 focus:outline-none"
                            />
                          </div>

                          <div className="text-right w-24">
                            <span className="font-extrabold text-slate-900 block">
                              {formatCurrency(item.total)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.productId)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Server Price Calculation Summary */}
                    <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(calculatedSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>UAE VAT (5%)</span>
                        <span>{formatCurrency(calculatedVat)}</span>
                      </div>
                      <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-100">
                        <span>TOTAL AMOUNT (AED)</span>
                        <span className="text-red-600">{formatCurrency(calculatedTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || selectedItems.length === 0}
                  className="w-full btn primary py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-4 shadow-md"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Creating Order & Generating Link...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>Create Order & Generate Stripe Payment Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
