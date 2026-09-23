"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Package,
  Phone,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  ArrowRight,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { maskPhoneNumber, formatPhoneDisplay } from "@/lib/phone-utils";

interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderDoc {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  company?: string;
  shippingAddress?: {
    address: string;
    city: string;
    emirate: string;
    country: string;
  };
  items: OrderItem[];
  subtotal: number;
  vat: number;
  totalAmount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function MyOrdersPage() {
  // Step state: 1 = Enter Phone, 2 = Enter OTP, 3 = Verified View Orders
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Phone input state
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [normalizedPhone, setNormalizedPhone] = useState<string>("");
  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // OTP input state
  const [otpInput, setOtpInput] = useState<string>("");
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devNotice, setDevNotice] = useState<string | null>(null);

  // Resend Timer (60 seconds)
  const [timer, setTimer] = useState<number>(0);

  // Verified Orders state
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // Fetch orders from authorized backend session
  const fetchOrders = useCallback(
    async (pageNum = 1, filterVal = statusFilter) => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const res = await fetch(`/api/my-orders?page=${pageNum}&limit=10&status=${filterVal}`);
        const data = await res.json();

        if (res.status === 401) {
          // No active OTP session
          setStep(1);
          setOrdersLoading(false);
          return;
        }

        if (res.ok && data.success) {
          setOrders(data.orders || []);
          setPagination(data.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
          if (data.verifiedPhone) {
            setNormalizedPhone(data.verifiedPhone);
          }
          setStep(3);
        } else {
          setOrdersError(data.error || "Unable to load your orders.");
        }
      } catch (err: any) {
        setOrdersError(err.message || "Failed to load order history.");
      } finally {
        setOrdersLoading(false);
      }
    },
    [statusFilter]
  );

  // Check if active OTP session already exists on load
  useEffect(() => {
    fetchOrders(1, statusFilter);
  }, [statusFilter, fetchOrders]);

  // Handle Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    if (!phoneInput.trim()) {
      setPhoneError("Please enter your mobile phone number.");
      return;
    }

    setSendingOtp(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStep(2);
        setTimer(60);
        if (data.devOtpMessage) {
          setDevNotice(data.devOtpMessage);
        }
      } else {
        setPhoneError(data.error || "Unable to send verification code. Please check your number.");
      }
    } catch (err: any) {
      setPhoneError("Network error. Please check your connection and try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  // Handle Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    if (!otpInput.trim() || otpInput.trim().length < 6) {
      setOtpError("Please enter the complete 6-digit verification code.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput.trim(), otp: otpInput.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Fetch verified orders for this session
        fetchOrders(1, statusFilter);
      } else {
        setOtpError(data.error || "Invalid verification code. Please try again.");
      }
    } catch (err: any) {
      setOtpError("Verification error. Please check your connection.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Handle Logout / Change Number
  const handleLogoutSession = async () => {
    try {
      await fetch("/api/auth/logout-otp", { method: "POST" });
    } catch {
      // ignore
    }
    setStep(1);
    setOrders([]);
    setOtpInput("");
    setPhoneInput("");
    setDevNotice(null);
  };

  const getOrderStatusBadge = (status: string) => {
    const stat = (status || "").toUpperCase();
    if (stat === "DELIVERED" || stat === "SHIPPED") {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
          {stat}
        </span>
      );
    }
    if (stat === "PROCESSING") {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
          PROCESSING
        </span>
      );
    }
    if (stat === "CANCELLED") {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-zinc-100 text-zinc-700 border border-zinc-200">
          CANCELLED
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
        {stat || "PENDING"}
      </span>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const stat = (status || "").toUpperCase();
    if (stat === "PAID" || stat === "CAPTURED") {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          PAID
        </span>
      );
    }
    if (stat === "FAILED") {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
          FAILED
        </span>
      );
    }
    if (stat === "REFUNDED" || stat === "PARTIALLY_REFUNDED") {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
          {stat}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-zinc-100 text-zinc-700 border border-zinc-200">
        UNPAID
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-14 space-y-8">
      {/* Step 1: Mobile Input Screen — Pure Red + White + Black Theme */}
      {step === 1 && (
        <div className="max-w-md mx-auto bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
              <Package className="w-7 h-7" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-red-600 block">
              HALIMA TRADING L.L.C.
            </span>
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight">MY ORDERS</h1>
            <p className="text-xs font-medium text-zinc-600 max-w-xs mx-auto">
              Track your orders securely using your mobile number. No passwords required.
            </p>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-extrabold text-zinc-800 mb-1.5">
                Mobile Number <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="tel"
                  required
                  placeholder="+971 50 123 4567"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  disabled={sendingOtp}
                  className="w-full pl-10 pr-4 py-3.5 text-sm bg-slate-50 border border-zinc-300 rounded-xl font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white placeholder:text-zinc-400"
                />
              </div>
              <span className="text-[11px] text-zinc-500 font-medium mt-1.5 block">
                Enter your UAE or GCC mobile number used during checkout.
              </span>
            </div>

            {phoneError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{phoneError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={sendingOtp || !phoneInput.trim()}
              className="w-full bg-[#d71920] hover:bg-red-700 text-white py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-red-600/20 transition-all"
            >
              {sendingOtp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending OTP...</span>
                </>
              ) : (
                <>
                  <span>Send OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-3 border-t border-zinc-100">
            <span className="text-[11px] font-semibold text-zinc-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Secure Passwordless Order Verification
            </span>
          </div>
        </div>
      )}

      {/* Step 2: OTP Verification Screen — Pure Red + White + Black Theme */}
      {step === 2 && (
        <div className="max-w-md mx-auto bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 block">
              Verification Code Sent
            </span>
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight">VERIFY YOUR MOBILE</h1>
            <p className="text-xs font-medium text-zinc-600 max-w-xs mx-auto">
              We sent a 6-digit verification code to:
              <br />
              <strong className="text-zinc-900 font-extrabold text-sm">{maskPhoneNumber(phoneInput)}</strong>
            </p>
          </div>

          {devNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 text-center font-mono font-bold">
              {devNotice}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-extrabold text-zinc-800 mb-1.5 text-center">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                required
                autoFocus
                placeholder="• • • • • •"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/[^\d]/g, ""))}
                disabled={verifyingOtp}
                className="w-full py-3.5 text-center text-2xl font-mono tracking-widest bg-slate-50 border border-zinc-300 rounded-xl font-extrabold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
            </div>

            {otpError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{otpError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={verifyingOtp || otpInput.trim().length < 6}
              className="w-full bg-[#d71920] hover:bg-red-700 text-white py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-red-600/20 transition-all"
            >
              {verifyingOtp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify OTP & View Orders</span>
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-zinc-600 hover:text-black font-bold cursor-pointer transition-colors"
            >
              ← Change Mobile Number
            </button>

            {timer > 0 ? (
              <span className="text-zinc-400 font-mono font-semibold">Resend in 00:{timer < 10 ? `0${timer}` : timer}</span>
            ) : (
              <button
                type="button"
                onClick={handleSendOtp}
                className="text-red-600 font-extrabold hover:underline cursor-pointer"
              >
                Resend Code
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Verified Orders Screen — Red + White + Black Theme */}
      {step === 3 && (
        <div className="space-y-8">
          {/* Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-red-600">
                Verified Account History
              </span>
              <h1 className="text-3xl font-black text-zinc-900 mt-1 flex items-center gap-2 tracking-tight">
                <Package className="w-8 h-8 text-red-600" /> My Orders
              </h1>
              <p className="text-sm font-medium text-zinc-600 mt-1">
                Orders associated with verified mobile: <strong className="text-zinc-900 font-extrabold">{formatPhoneDisplay(normalizedPhone)}</strong>
              </p>
            </div>

            <button
              onClick={handleLogoutSession}
              className="bg-white text-zinc-800 px-4 py-2.5 rounded-xl font-bold text-xs border border-zinc-300 hover:border-zinc-400 flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <LogOut className="w-4 h-4 text-zinc-500" />
              <span>Sign Out / Change Number</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
            <div className="flex flex-wrap items-center gap-1.5">
              {["ALL", "PROCESSING", "COMPLETED", "CANCELLED", "FAILED", "REFUNDED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    statusFilter === tab
                      ? "bg-[#d71920] text-white shadow-xs"
                      : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
                  }`}
                >
                  {tab === "ALL" ? "All Orders" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchOrders(pagination.page, statusFilter)}
              className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg bg-white cursor-pointer"
              title="Refresh orders list"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
              <span>Refresh</span>
            </button>
          </div>

          {/* Main Order Content */}
          {ordersLoading ? (
            <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 text-center bg-white border border-zinc-200 rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
              <p className="text-sm font-bold text-zinc-800">Finding your orders in MongoDB...</p>
            </div>
          ) : ordersError ? (
            <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
              <div>
                <h3 className="text-lg font-black text-zinc-900">Unable to load orders</h3>
                <p className="text-sm font-medium text-zinc-600 mt-1 max-w-md mx-auto">{ordersError}</p>
              </div>
              <button
                onClick={() => fetchOrders(1, statusFilter)}
                className="bg-[#d71920] hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mx-auto">
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-black text-zinc-900">No Orders Found</h2>
                <p className="text-sm font-medium text-zinc-600 mt-1 max-w-md mx-auto">
                  {statusFilter !== "ALL"
                    ? `No orders matching status "${statusFilter}" were found for ${formatPhoneDisplay(normalizedPhone)}.`
                    : `No purchase history found for mobile number ${formatPhoneDisplay(normalizedPhone)}.`}
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={handleLogoutSession}
                  className="bg-white text-zinc-800 border border-zinc-300 hover:border-zinc-400 px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-zinc-500" /> Try Different Number
                </button>
                <Link
                  href="/shop"
                  className="bg-[#d71920] hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2 shadow-md"
                >
                  <ShoppingBag className="w-4 h-4" /> Shop Now
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex flex-wrap justify-between items-center gap-3 border-b border-zinc-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-base text-zinc-900">
                          Order #{ord.orderNumber}
                        </span>
                        {getOrderStatusBadge(ord.orderStatus)}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(ord.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span>·</span>
                        <span>{ord.items?.length || 0} item(s)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs text-zinc-400 block font-semibold">Payment Status</span>
                        {getPaymentStatusBadge(ord.paymentStatus)}
                      </div>
                      <div className="text-right pl-4 border-l border-zinc-200">
                        <span className="text-xs text-zinc-400 block font-semibold">Total</span>
                        <span className="font-black text-base text-red-600">
                          {formatCurrency(ord.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items Snapshot */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {ord.items?.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-zinc-200">
                        <img
                          src={item.image || "/featured/hisense-window-ac.png"}
                          alt={item.name}
                          className="w-12 h-12 object-contain bg-white rounded-lg p-1 border border-zinc-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-zinc-900 truncate">
                            {item.name}
                          </h4>
                          <p className="text-[11px] font-medium text-zinc-500">
                            Qty: {item.quantity} · {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {ord.items && ord.items.length > 3 && (
                      <div className="flex items-center justify-center p-2 text-xs font-bold text-zinc-500 bg-slate-50 rounded-xl border border-zinc-200">
                        +{ord.items.length - 3} more item(s)
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
                    <span className="text-zinc-600 font-medium truncate max-w-xs">
                      Deliver to: <strong className="text-zinc-900 font-bold">{ord.customerName}</strong> ({ord.shippingAddress?.emirate || "UAE"})
                    </span>
                    <Link
                      href={`/my-orders/${ord.id}`}
                      className="bg-[#d71920] hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 text-xs transition-all shadow-xs"
                    >
                      <span>View Order</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                  <span className="text-xs font-semibold text-zinc-600">
                    Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} orders total)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={pagination.page <= 1}
                      onClick={() => fetchOrders(pagination.page - 1, statusFilter)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 bg-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>
                    <button
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchOrders(pagination.page + 1, statusFilter)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 bg-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
