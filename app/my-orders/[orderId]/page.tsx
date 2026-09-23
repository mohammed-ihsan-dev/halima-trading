"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Truck,
  MapPin,
  Mail,
  Phone,
  Building,
  CreditCard,
  Loader2,
  ShieldCheck,
  PhoneCall,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatPhoneDisplay } from "@/lib/phone-utils";

interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  company?: string;
  shippingAddress?: {
    address: string;
    city: string;
    emirate: string;
    country: string;
  };
  customerNotes?: string;
  items: OrderItem[];
  subtotal?: number;
  vat?: number;
  taxAmount?: number;
  shipping?: number;
  totalAmount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentId?: string;
  trackingNumber?: string;
  createdAt: string;
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(null);
      setIsUnauthorized(false);
      try {
        const res = await fetch(`/api/my-orders/${orderId}`);
        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
          setIsUnauthorized(true);
          setError(data.message || data.error || "OTP verification required to access this order.");
          return;
        }

        if (res.ok && data.success && data.order) {
          setOrder(data.order);
        } else {
          setError(data.error || "Order not found or access denied.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load order details.");
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin mb-4" />
        <p className="text-sm font-bold text-zinc-800">Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-zinc-900">
            {isUnauthorized ? "OTP Verification Required" : "Order Unavailable"}
          </h1>
          <p className="text-sm font-medium text-zinc-600 mt-2 max-w-md mx-auto">
            {error || "We couldn't retrieve the requested order."}
          </p>
        </div>
        <Link
          href="/my-orders"
          className="inline-flex items-center gap-2 bg-[#d71920] hover:bg-red-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-md"
        >
          {isUnauthorized ? <PhoneCall className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{isUnauthorized ? "Verify Mobile Number via OTP" : "Back to My Orders"}</span>
        </Link>
      </div>
    );
  }

  const ordStatus = (order.orderStatus || "").toUpperCase();
  const payStatus = (order.paymentStatus || "").toUpperCase();

  const isPaid = payStatus === "PAID" || payStatus === "CAPTURED";
  const isFailed = payStatus === "FAILED";
  const isRefunded = payStatus === "REFUNDED" || payStatus === "PARTIALLY_REFUNDED";
  const isCancelled = ordStatus === "CANCELLED";
  const isShipped = ordStatus === "SHIPPED";
  const isDelivered = ordStatus === "DELIVERED" || ordStatus === "COMPLETED";
  const isProcessing = ordStatus === "PROCESSING";

  // Build 5-step status timeline reflecting real state
  const steps = [
    {
      stepKey: "placed",
      title: "Order Placed",
      subtitle: new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      completed: true,
      current: false,
      failed: false,
    },
    {
      stepKey: "payment",
      title: "Payment Confirmed",
      subtitle: isPaid ? "Payment Received" : isRefunded ? "Payment Refunded" : isFailed ? "Payment Failed" : "Pending Payment",
      completed: isPaid,
      failed: isFailed,
      refunded: isRefunded,
      current: !isPaid && !isFailed && !isRefunded && !isCancelled,
    },
    {
      stepKey: "processing",
      title: "Processing",
      subtitle: isCancelled ? "Order Cancelled" : isProcessing ? "In Progress" : isShipped || isDelivered ? "Processed" : "Awaiting Payment",
      completed: isProcessing || isShipped || isDelivered,
      failed: isCancelled,
      current: isProcessing,
    },
    {
      stepKey: "shipped",
      title: "Shipped",
      subtitle: order.trackingNumber ? `Ref: ${order.trackingNumber}` : isShipped ? "Dispatched" : isDelivered ? "Dispatched" : "Pending Dispatch",
      completed: isShipped || isDelivered,
      current: isShipped,
      failed: isCancelled,
    },
    {
      stepKey: "delivered",
      title: "Delivered",
      subtitle: isDelivered ? "Package Delivered" : "Final Step",
      completed: isDelivered,
      current: false,
      failed: isCancelled,
    },
  ];

  return (
    <div className="bg-zinc-50/50 min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation back */}
        <Link
          href="/my-orders"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-700 hover:text-red-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Orders
        </Link>

        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm flex flex-wrap justify-between items-center gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-red-600">
              Halima Trading L.L.C.
            </span>
            <h1 className="text-2xl font-black text-zinc-900 mt-0.5 tracking-tight">
              ORDER #{order.orderNumber}
            </h1>
            <p className="text-xs font-semibold text-zinc-500 mt-1 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Placed on {new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[11px] font-extrabold text-zinc-500 uppercase block">Order Status</span>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border mt-0.5 ${
                isDelivered
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : isCancelled
                  ? "bg-zinc-100 text-zinc-700 border-zinc-300"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}>
                {ordStatus}
              </span>
            </div>

            <div className="text-right border-l border-zinc-200 pl-3">
              <span className="text-[11px] font-extrabold text-zinc-500 uppercase block">Payment Status</span>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border mt-0.5 ${
                isPaid
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : isFailed
                  ? "bg-red-50 text-red-800 border-red-200"
                  : isRefunded
                  ? "bg-purple-50 text-purple-800 border-purple-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}>
                {payStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Cancellation or Failure Banner if applicable */}
        {(isCancelled || isFailed || isRefunded) && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-bold ${
            isCancelled
              ? "bg-zinc-100 border-zinc-300 text-zinc-800"
              : isFailed
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-purple-50 border-purple-200 text-purple-800"
          }`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-extrabold">
                {isCancelled
                  ? "This order has been cancelled."
                  : isFailed
                  ? "Payment for this order was not successful."
                  : "Payment for this order has been refunded."}
              </p>
              <p className="text-[11px] font-medium opacity-90 mt-0.5">
                If you have questions or need assistance, please contact our Abu Dhabi support team.
              </p>
            </div>
          </div>
        )}

        {/* 5-Step Status Timeline */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-red-600" /> Order Status Timeline
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative pt-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex md:flex-col items-center md:items-start gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    step.failed
                      ? "bg-zinc-100 text-zinc-500 border border-zinc-300"
                      : step.refunded
                      ? "bg-purple-100 text-purple-700 border border-purple-300"
                      : step.completed
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      : step.current
                      ? "bg-[#d71920] text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                  }`}>
                    {step.failed ? (
                      <XCircle className="w-4 h-4" />
                    ) : step.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black text-zinc-900">{step.title}</h3>
                  <p className="text-[11px] font-medium text-zinc-500 mt-0.5">{step.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Details Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Customer & Delivery Information */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-600" /> Customer Information
              </h3>
              <div className="text-xs space-y-2 text-zinc-700">
                <p className="font-extrabold text-zinc-900 text-sm">{order.customerName}</p>
                <p className="flex items-center gap-2 text-zinc-600 font-medium">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                  <span>{order.customerEmail}</span>
                </p>
                {order.customerPhone && (
                  <p className="flex items-center gap-2 text-zinc-600 font-medium">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                    <span>{formatPhoneDisplay(order.customerPhone)}</span>
                  </p>
                )}
                {order.company && (
                  <p className="flex items-center gap-2 text-zinc-600 font-medium">
                    <Building className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                    <span>{order.company}</span>
                  </p>
                )}
              </div>
            </div>

            {order.shippingAddress && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-600" /> Delivery Address
                </h3>
                <div className="text-xs space-y-1 text-zinc-700">
                  <p className="font-bold text-zinc-900">{order.shippingAddress.address}</p>
                  <p className="font-medium text-zinc-600">{order.shippingAddress.city}, {order.shippingAddress.emirate}</p>
                  <p className="font-black text-zinc-800">{order.shippingAddress.country}</p>
                </div>
                {order.customerNotes && (
                  <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500">
                    <strong className="text-zinc-800 font-bold">Customer Notes:</strong> {order.customerNotes}
                  </div>
                )}
              </div>
            )}

            {/* Payment Record Info */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" /> Payment Reference
              </h3>
              <div className="text-xs space-y-1 text-zinc-600">
                <p>Provider: <strong className="text-zinc-900 capitalize font-bold">Stripe Secure Checkout</strong></p>
                {order.paymentId && <p className="font-mono text-[11px]">Ref: {order.paymentId}</p>}
                <p className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Verified OTP Session Security
                </p>
              </div>
            </div>
          </div>

          {/* Items & Financial Summary */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-5">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 pb-3 border-b border-zinc-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" /> Ordered Items ({order.items.length})
              </h3>

              <div className="divide-y divide-zinc-100">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-4 first:pt-0 last:pb-0 flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-50 rounded-xl p-1 border border-zinc-200 shrink-0 flex items-center justify-center">
                      <img
                        src={item.image || "/featured/hisense-window-ac.png"}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-extrabold text-zinc-900 truncate">{item.name}</h4>
                      <p className="text-[11px] font-medium text-zinc-500 mt-0.5">SKU: {item.sku}</p>
                      <p className="text-xs font-semibold text-zinc-600 mt-1">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-zinc-900">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Calculation Summary */}
              <div className="pt-4 border-t border-zinc-200 space-y-2 text-xs font-semibold text-zinc-600">
                {order.subtotal !== undefined && (
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                )}
                {(order.vat !== undefined || order.taxAmount !== undefined) && (
                  <div className="flex justify-between">
                    <span>UAE VAT (5%)</span>
                    <span>{formatCurrency(order.vat ?? order.taxAmount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-zinc-900 pt-2 border-t border-zinc-100">
                  <span>TOTAL AMOUNT</span>
                  <span className="text-red-600">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
