"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Package,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
];

function OrderDetailsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const productId = searchParams.get("productId");
  const initialQty = parseInt(searchParams.get("quantity") || "1", 10);

  const [product, setProduct] = useState<any>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [quantity, setQuantity] = useState(initialQty > 0 ? initialQty : 1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    company: "",
    address: "",
    city: "Abu Dhabi",
    emirate: "Abu Dhabi",
    country: "United Arab Emirates",
    customerNotes: "",
  });

  // Load existing draft from sessionStorage if available
  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem("halima_checkout_draft");
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.customerName) setFormData((prev) => ({ ...prev, ...parsed }));
        if (parsed.quantity && !searchParams.get("quantity")) {
          setQuantity(parsed.quantity);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [searchParams]);

  // Fetch product from MongoDB server API
  useEffect(() => {
    if (!productId) {
      setLoadingProduct(false);
      return;
    }

    let isMounted = true;
    async function fetchProduct() {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (isMounted && res.ok && data.success && Array.isArray(data.data)) {
          const found = data.data.find(
            (p: any) => p.id === productId || p.slug === productId
          );
          if (found) {
            setProduct(found);
          } else {
            setErrorMessage("Selected product could not be found.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.message || "Failed to load product details.");
        }
      } finally {
        if (isMounted) setLoadingProduct(false);
      }
    }

    fetchProduct();
    return () => {
      isMounted = false;
    };
  }, [productId]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.customerName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (
      !formData.customerEmail.trim() ||
      !formData.customerEmail.includes("@")
    ) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!formData.customerPhone.trim()) {
      setErrorMessage("Please enter a valid contact phone number.");
      return;
    }
    if (!formData.address.trim()) {
      setErrorMessage("Please enter your delivery street address.");
      return;
    }
    if (!formData.city.trim()) {
      setErrorMessage("Please enter your city.");
      return;
    }

    if (!product) {
      setErrorMessage("No product selected for purchase.");
      return;
    }

    const checkoutDraft = {
      ...formData,
      productId: product.id,
      productName: product.name,
      productImage: product.images?.[0],
      productBrand: product.brand,
      productModel: product.model,
      unitPrice: product.price || 0,
      deliveryRate: product.deliveryRate || 0,
      quantity,
    };

    sessionStorage.setItem(
      "halima_checkout_draft",
      JSON.stringify(checkoutDraft)
    );
    router.push("/checkout/confirmation");
  };

  if (loadingProduct) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-white text-zinc-900">
        <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
        <h2 className="text-base font-bold text-zinc-900">
          Loading Checkout...
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Retrieving product details from server.
        </p>
      </div>
    );
  }

  if (!product && !loadingProduct) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-white text-zinc-900">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-900">
            No Product Selected
          </h1>
          <p className="text-xs text-zinc-500">
            Please select an item from our catalog to proceed with purchase.
          </p>
          <Link
            href="/shop"
            className="btn primary px-6 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const unitPrice = product.price || 0;
  const deliveryRate = product.deliveryRate || 0;
  const subtotal = unitPrice * quantity;
  const shippingTotal = deliveryRate * quantity;
  const vat = Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = subtotal + shippingTotal + vat;

  return (
    <div className="min-h-screen bg-white text-zinc-900 py-8 md:py-12">
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        {/* Top Header & Minimal Stepper */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <Link
              href={`/shop/${product.slug || product.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-red-600 transition-colors mb-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Product</span>
            </Link>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 tracking-tight">
              CHECKOUT
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Complete your order securely with Halima Trading L.L.C.
            </p>
          </div>

          {/* Minimal Stepper */}
          <div className="flex items-center gap-3 bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold">
            <div className="flex items-center gap-2 text-red-600 font-bold">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Customer Details</span>
            </div>
            <span className="text-zinc-300">→</span>
            <div className="flex items-center gap-2 text-zinc-400 font-medium">
              <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Confirmation</span>
            </div>
            <span className="text-zinc-300">→</span>
            <div className="flex items-center gap-2 text-zinc-400 font-medium">
              <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Payment</span>
            </div>
          </div>
        </div>

        {/* 2-Column Desktop Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Form Area (~68%) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            {errorMessage && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{errorMessage}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section 1: Customer Information */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-5">
                <div className="border-b border-zinc-100 pb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Customer Information
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="customerName"
                      required
                      value={formData.customerName}
                      onChange={handleInputChange}
                      placeholder="e.g. Rashid Al Mansoori"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Email Address <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="email"
                        name="customerEmail"
                        required
                        value={formData.customerEmail}
                        onChange={handleInputChange}
                        placeholder="name@company.ae"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Phone Number <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="tel"
                        name="customerPhone"
                        required
                        value={formData.customerPhone}
                        onChange={handleInputChange}
                        placeholder="+971 50 123 4567"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Company Name{" "}
                      <span className="text-zinc-400 font-normal">
                        (Optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                      placeholder="Halima Trading L.L.C."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Shipping Address */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-5">
                <div className="border-b border-zinc-100 pb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Shipping Address
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Street Address / Sector{" "}
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="address"
                      required
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="Building name, street address, Musaffah M-14"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        City <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        required
                        value={formData.city}
                        onChange={handleInputChange}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Emirate <span className="text-red-600">*</span>
                      </label>
                      <select
                        name="emirate"
                        value={formData.emirate}
                        onChange={handleInputChange}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all"
                      >
                        {EMIRATES.map((em) => (
                          <option key={em} value={em}>
                            {em}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        name="country"
                        readOnly
                        value={formData.country}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-600 text-sm cursor-not-allowed font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Delivery Notes{" "}
                      <span className="text-zinc-400 font-normal">
                        (Optional)
                      </span>
                    </label>
                    <textarea
                      name="customerNotes"
                      rows={3}
                      value={formData.customerNotes}
                      onChange={handleInputChange}
                      placeholder="Special delivery instructions or preferred delivery timing"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-400"
                    />
                  </div>
                </div>
              </div>

              {/* Form Primary Action Button */}
              <button
                type="submit"
                className="w-full py-4 px-6 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                <span>CONTINUE TO CONFIRMATION</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Sticky Order Summary Sidebar (~32%) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm sticky top-24 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h2 className="font-bold text-zinc-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-red-600" />
                  <span>ORDER SUMMARY</span>
                </h2>
                <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">
                  1 ITEM
                </span>
              </div>

              {/* Product Thumbnail Row */}
              <div className="flex items-start gap-3 bg-zinc-50/80 p-3 rounded-xl border border-zinc-200/60">
                <img
                  src={product.images?.[0] || "/featured/hisense-window-ac.png"}
                  alt={product.name}
                  className="w-16 h-16 object-contain rounded-lg border border-zinc-200 bg-white p-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-xs text-zinc-900 truncate">
                    {product.name}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {product.brand} · Model {product.model}
                  </p>
                  <div className="text-xs font-semibold text-zinc-800 mt-1">
                    {formatCurrency(unitPrice)}{" "}
                    <span className="text-zinc-400 font-normal">
                      × {quantity}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Breakdown Hierarchy */}
              <div className="border-t border-b border-zinc-100 py-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-zinc-900">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Delivery Charge</span>
                  <span className="font-semibold text-zinc-900">
                    {shippingTotal === 0 ? (
                      <strong className="text-emerald-600 font-bold uppercase">
                        FREE DELIVERY
                      </strong>
                    ) : (
                      formatCurrency(shippingTotal)
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>UAE VAT (5%)</span>
                  <span className="font-semibold text-zinc-800">
                    {formatCurrency(vat)}
                  </span>
                </div>
              </div>

              {/* Total Payable in Halima Red */}
              <div className="flex justify-between items-center text-sm font-extrabold text-zinc-900">
                <span>TOTAL PAYABLE</span>
                <span className="text-red-600 text-xl font-mono font-bold">
                  {formatCurrency(grandTotal)}
                </span>
              </div>

              {/* Trust Badge */}
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 space-y-1.5 text-[11px] text-zinc-600">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>✓ Secure server-verified pricing</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span>256-bit SSL encrypted connection</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      }
    >
      <OrderDetailsContent />
    </Suspense>
  );
}
