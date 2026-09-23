"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ShoppingBag, ArrowRight, Package, Loader2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/currency";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { clear } = useCart();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchOrderStatus() {
      try {
        const res = await fetch(`/api/checkout/order-status?orderId=${orderId}`);
        const data = await res.json();

        if (isMounted) {
          if (res.ok && data.success) {
            setOrder(data.order);
            clear();
          } else {
            setError(data.error || "Order details could not be found.");
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load order status.");
          setLoading(false);
        }
      }
    }

    fetchOrderStatus();

    return () => {
      isMounted = false;
    };
  }, [orderId, clear]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
        <h2 className="text-base font-bold text-zinc-900">Verifying your order...</h2>
        <p className="text-xs text-zinc-500 mt-1">Please wait while we confirm your payment details.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 py-12 md:py-20">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Payment Completed
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 mt-1">
              ORDER CONFIRMED
            </h1>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Thank you for your purchase! Your payment has been recorded and our team is preparing your items.
            </p>
          </div>

          {order ? (
            <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200 text-left space-y-4 max-w-xl mx-auto">
              <div className="flex flex-wrap justify-between items-center border-b border-zinc-200 pb-3 gap-2">
                <div>
                  <span className="text-[11px] text-zinc-400 uppercase font-semibold block">Order Reference</span>
                  <span className="font-mono font-bold text-base text-zinc-900">
                    #{order.orderNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {order.paymentStatus === "PAID" ? "PAID" : order.paymentStatus}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    {order.orderStatus}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Purchased Items</span>
                {order.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1">
                    <span className="text-zinc-800 font-medium">
                      {item.name} <span className="text-zinc-400">×{item.quantity}</span>
                    </span>
                    <span className="font-bold text-zinc-900">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-200 pt-3 flex justify-between items-center text-sm font-bold text-zinc-900">
                <span>Total Paid</span>
                <span className="text-red-600 text-base font-mono font-bold">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-500">
              Order Reference ID: {orderId || "N/A"}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={order ? `/my-orders/${order.id}` : `/my-orders`}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm border-0"
            >
              <Package className="w-4 h-4" />
              <span>VIEW MY ORDER</span>
            </Link>
            <Link
              href="/shop"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white border border-zinc-300 hover:border-zinc-400 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>CONTINUE SHOPPING</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
