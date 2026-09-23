"use client";

import { useState, useEffect } from "react";
import { X, Lock, CreditCard, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/currency";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
];

export default function CheckoutModal({ isOpen, onClose }: CheckoutModalProps) {
  const { items, total } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    company: "",
    address: "",
    city: "Abu Dhabi",
    emirate: "Abu Dhabi",
    country: "UAE",
    customerNotes: "",
  });

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic Client-Side UX Validation
    if (!formData.customerName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!formData.customerEmail.trim() || !formData.customerEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!formData.customerPhone.trim()) {
      setErrorMessage("Please enter a valid contact phone number.");
      return;
    }
    if (!formData.address.trim()) {
      setErrorMessage("Please enter your delivery shipping address.");
      return;
    }
    if (!formData.city.trim()) {
      setErrorMessage("Please enter your city.");
      return;
    }
    if (items.length === 0) {
      setErrorMessage("Your shopping cart is empty.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        company: formData.company,
        shippingAddress: {
          address: formData.address,
          city: formData.city,
          emirate: formData.emirate,
          country: formData.country,
        },
        customerNotes: formData.customerNotes,
      };

      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to initiate payment session. Please try again.");
      }

      if (data.url) {
        // Redirect customer to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL was returned from the payment server.");
      }
    } catch (err: any) {
      console.error("Checkout submission failed:", err);
      setErrorMessage(err?.message || "An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  const totalDelivery = items.reduce((sum, item) => sum + (item.deliveryRate || 0) * item.quantity, 0);
  const estimatedVat = Math.round(total * 0.05 * 100) / 100;
  const grandTotal = total + totalDelivery + estimatedVat;

  return (
    <div
      className="checkout-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={() => !isSubmitting && onClose()}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="checkout-modal-card bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 relative transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Secure Checkout</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Complete your details to proceed to Stripe payment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Checkout Error</span>
              {errorMessage}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Contact Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
              1. Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="customerName"
                  required
                  value={formData.customerName}
                  onChange={handleInputChange}
                  placeholder="e.g. Rashid Al Mansoori"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="customerEmail"
                  required
                  value={formData.customerEmail}
                  onChange={handleInputChange}
                  placeholder="name@company.ae"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="customerPhone"
                  required
                  value={formData.customerPhone}
                  onChange={handleInputChange}
                  placeholder="+971 50 123 4567"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Company / Organization <span className="text-zinc-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  placeholder="e.g. Halima Trading L.L.C."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          {/* Shipping Address Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
              2. Delivery & Shipping Address
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Street Address / Area <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="address"
                  required
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Building, Street, Industrial Area / Sector"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="e.g. Abu Dhabi"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Emirate <span className="text-red-500">*</span>
                </label>
                <select
                  name="emirate"
                  value={formData.emirate}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {EMIRATES.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  name="country"
                  readOnly
                  value={formData.country}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-sm cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Delivery Notes <span className="text-zinc-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="customerNotes"
                  value={formData.customerNotes}
                  onChange={handleInputChange}
                  placeholder="Gate code, floor or timing preference"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          {/* Order Summary Breakdown */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4 border border-zinc-200/60 dark:border-zinc-800 space-y-2">
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Items Subtotal ({items.reduce((sum, i) => sum + i.quantity, 0)} items)</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Delivery Charge</span>
              <span>
                {totalDelivery === 0 ? (
                  <strong className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                    FREE DELIVERY
                  </strong>
                ) : (
                  formatCurrency(totalDelivery)
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Estimated UAE VAT (5%)</span>
              <span>{formatCurrency(estimatedVat)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-700">
              <span>Total Payable</span>
              <span className="text-red-600 dark:text-red-400">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Action & Security Indication */}
          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0}
              className="w-full py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Checkout...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Pay Securely with Card</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>256-bit SSL Encrypted Payment via Stripe</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
