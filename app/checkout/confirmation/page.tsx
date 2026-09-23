"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Edit2,
  CheckCircle2,
  Package,
  MapPin,
  User,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";

function ConfirmationContent() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem("halima_checkout_draft");
      if (savedDraft) {
        setDraft(JSON.parse(savedDraft));
      } else {
        router.replace("/shop");
      }
    } catch {
      router.replace("/shop");
    }
  }, [router]);

  if (!draft) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
        <h2 className="text-sm font-bold text-zinc-900">
          Loading Order Confirmation...
        </h2>
      </div>
    );
  }

  const handleProceedToPayment = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        items: [
          {
            productId: draft.productId,
            quantity: draft.quantity || 1,
          },
        ],
        customerName: draft.customerName,
        customerEmail: draft.customerEmail,
        customerPhone: draft.customerPhone,
        company: draft.company,
        shippingAddress: {
          address: draft.address,
          city: draft.city,
          emirate: draft.emirate,
          country: draft.country || "UAE",
        },
        customerNotes: draft.customerNotes,
      };

      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to create payment session. Please try again."
        );
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(
          "Payment server did not return a valid Stripe Checkout URL."
        );
      }
    } catch (err: any) {
      console.error("Payment session creation failed:", err);
      setErrorMessage(
        err?.message || "An unexpected error occurred during checkout creation."
      );
      setIsSubmitting(false);
    }
  };

  const unitPrice = draft.unitPrice || 0;
  const deliveryRate = draft.deliveryRate || 0;
  const quantity = draft.quantity || 1;
  const subtotal = unitPrice * quantity;
  const shippingTotal = deliveryRate * quantity;
  const vat = Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = subtotal + shippingTotal + vat;

  const editUrl = `/checkout/order-details?productId=${encodeURIComponent(
    draft.productId || ""
  )}&quantity=${quantity}`;

  return (
    <div className="min-h-screen bg-white text-zinc-900 py-8 md:py-12">
      <div className="max-w-4xl mx-auto px-4 space-y-8">
        {/* Header & Minimal Stepper */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 tracking-tight">
              REVIEW YOUR ORDER
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Please review your details before proceeding to secure payment.
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-3 bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold">
            <Link
              href={editUrl}
              className="flex items-center gap-1.5 text-emerald-700 font-bold hover:underline"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Customer Details</span>
            </Link>
            <span className="text-zinc-300">→</span>
            <div className="flex items-center gap-2 text-red-600 font-bold">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]">
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

        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-sm mb-0.5">Payment Error</span>
              {errorMessage}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Card 1: Customer Information Review */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-2">
                <User className="w-4 h-4 text-red-600" />
                <span>1. Customer Information</span>
              </h2>
              <Link
                href={editUrl}
                className="text-xs text-zinc-700 font-bold hover:text-red-600 flex items-center gap-1 border border-zinc-300 px-3 py-1 rounded-lg hover:border-zinc-400 transition-all bg-white"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-zinc-400 block font-medium">Full Name</span>
                <span className="font-bold text-zinc-900 text-sm">
                  {draft.customerName}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block font-medium">Email Address</span>
                <span className="font-medium text-zinc-800 font-mono">
                  {draft.customerEmail}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block font-medium">Phone Number</span>
                <span className="font-medium text-zinc-800">
                  {draft.customerPhone}
                </span>
              </div>
              {draft.company && (
                <div>
                  <span className="text-zinc-400 block font-medium">Company</span>
                  <span className="font-medium text-zinc-800">
                    {draft.company}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Shipping Address Review */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-600" />
                <span>2. Delivery Address</span>
              </h2>
              <Link
                href={editUrl}
                className="text-xs text-zinc-700 font-bold hover:text-red-600 flex items-center gap-1 border border-zinc-300 px-3 py-1 rounded-lg hover:border-zinc-400 transition-all bg-white"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </Link>
            </div>

            <div className="text-xs text-zinc-800 space-y-1">
              <p className="font-semibold text-sm">{draft.address}</p>
              <p>{draft.city}, {draft.emirate}</p>
              <p className="font-medium text-zinc-500">{draft.country || "United Arab Emirates"}</p>
              {draft.customerNotes && (
                <div className="mt-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-zinc-600 italic">
                  Notes: {draft.customerNotes}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Order Items & Breakdown Review */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-5">
            <div className="border-b border-zinc-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                <span>3. Order Details</span>
              </h2>
            </div>

            <div className="flex items-center gap-4 py-2">
              <img
                src={draft.productImage || "/featured/hisense-window-ac.png"}
                alt={draft.productName}
                className="w-16 h-16 object-contain rounded-xl border border-zinc-200 bg-white p-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-zinc-900 truncate">
                  {draft.productName}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {draft.productBrand} · Model {draft.productModel}
                </p>
                <div className="text-xs text-zinc-600 mt-1">
                  Quantity: {draft.quantity} × {formatCurrency(unitPrice)}
                </div>
              </div>
              <div className="font-bold text-base text-zinc-900">
                {formatCurrency(subtotal)}
              </div>
            </div>

            <div className="bg-zinc-50 rounded-xl p-4 space-y-2 border border-zinc-200/80 text-xs">
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
              <div className="flex justify-between items-center text-sm font-extrabold text-zinc-900 pt-2.5 border-t border-zinc-200">
                <span>TOTAL PAYABLE</span>
                <span className="text-red-600 text-lg font-mono font-bold">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Primary Payment Action */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
            <button
              onClick={handleProceedToPayment}
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Redirecting to Stripe...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>PROCEED TO PAYMENT</span>
                </>
              )}
            </button>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 pt-2 border-t border-zinc-100">
              <Link
                href={editUrl}
                className="hover:text-red-600 flex items-center gap-1 font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Order Details
              </Link>

              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Secure payment powered by Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
