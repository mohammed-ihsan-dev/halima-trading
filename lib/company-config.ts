/**
 * Single Source of Truth for Halima Trading L.L.C. Contact & Company Details
 *
 * When the client provides an updated location or contact details, updating them in this file
 * will update the entire site (Contact page, Footer, Invoices, Layout, Admin, etc.).
 */
export const companyContact = {
  name: "HALIMA TRADING L.L.C.",
  shortName: "Halima Trading",
  legalName: "HALIMA TRADING EST / L.L.C.",
  tagline: "Premium Electronics & Home Appliances Across the UAE",

  // Public website address (canonical URLs, sitemap, share images). No trailing slash.
  siteUrl: "https://halimatrading.com",

  // Single Source of Truth for Location
  // Update this string when the final client-provided location is received
  location: "Zayed 2nd Street (Electra Road), Al Danah - Zone 1, Abu Dhabi, United Arab Emirates",
  building: "Zayed 2nd Street (Electra Road)",
  street: "Al Danah - Zone 1",
  city: "Abu Dhabi",
  country: "United Arab Emirates",
  // The client's Google Maps link for the business listing "Halima Trading L.L.C" (owner-claimed; place ID
  // ChIJS3gZI11mXj4RDYLfJS7E61s, 24.4910567, 54.3710563, plus code 7HPPF9RC+CC). Opens the exact pin, not a street search.
  googleMapsUrl: "https://maps.app.goo.gl/6PQ37q3qV2xp7e7g6",

  // Communication Details
  phone: "+971 56 568 5090",
  phoneRaw: "+971565685090",
  // Telephone section of the Contact page only. Independent of the WhatsApp number below.
  telephoneMobile: "050 671 1602",
  telephoneMobileRaw: "+971506711602",
  landline: "026725299", // shown as written locally; landlineRaw keeps the dialable international form
  landlineRaw: "+97126725299",
  whatsapp: "+971 56 568 5090",
  whatsappRaw: "971565685090",
  email: "Halimatradingest@gmail.com",
  supportEmail: "Halimatradingest@gmail.com",

  // Business Hours
  businessHours: "Monday–Saturday: 9:00 AM–8:00 PM",
  businessHoursFull: "Monday–Saturday: 9:00 AM–8:00 PM | Sunday: Contact us for availability",
};
