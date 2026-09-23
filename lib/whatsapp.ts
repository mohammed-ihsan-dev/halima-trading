/**
 * General contact WhatsApp helper for customer service / inquiries.
 * Note: Product purchase flow is website-native via Buy Now / Stripe Checkout.
 */
export const getGeneralWhatsAppContactUrl = (message?: string) => {
  const phone = "971565685090";
  const defaultText = message || "Hello Halima Trading, I have an inquiry.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(defaultText)}`;
};

