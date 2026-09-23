"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { XCircle, ShoppingCart, ArrowLeft, Loader2, Package } from "lucide-react";

function CancelContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="min-h-screen bg-white text-zinc-900 py-12 md:py-20">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
            <XCircle className="w-10 h-10" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Checkout Cancelled
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 mt-1">
              PAYMENT CANCELLED
            </h1>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Your payment process was cancelled. No charges were made to your account.
            </p>
          </div>

          {orderId && (
            <div className="bg-zinc-50 rounded-xl p-3 text-xs text-zinc-500 font-mono">
              Reference ID: {orderId}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/cart"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm border-0"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>RETURN TO CART</span>
            </Link>

            <Link
              href="/my-orders"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white border border-zinc-300 hover:border-zinc-400 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Package className="w-4 h-4" />
              <span>VIEW MY ORDERS</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
