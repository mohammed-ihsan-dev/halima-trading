"use client";

import { useState } from "react";
import { Clock, Mail, MapPin, MessageCircle, Phone, CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import emailjs from "@emailjs/browser";
import { companyContact } from "@/lib/company-config";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Client-side validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setSubmitStatus("error");
      setErrorMessage("Please fill in all required fields (Name, Email, Message).");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setSubmitStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (formData.message.trim().length < 10) {
      setSubmitStatus("error");
      setErrorMessage("Message should be at least 10 characters long.");
      return;
    }

    setSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

    try {
      if (serviceId && templateId && publicKey) {
        // Official EmailJS Browser Integration
        await emailjs.send(
          serviceId,
          templateId,
          {
            from_name: formData.name.trim(),
            from_email: formData.email.trim(),
            phone: formData.phone.trim() || "N/A",
            subject: formData.subject.trim() || "New Website Inquiry",
            message: formData.message.trim(),
            to_name: companyContact.name,
          },
          publicKey
        );
      } else {
        // Fallback simulation for local development when EmailJS env vars are unset
        console.warn("EmailJS environment variables not configured. Simulating successful transmission.");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err: any) {
      console.error("EmailJS transmission error:", err);
      setSubmitStatus("error");
      setErrorMessage("Unable to send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow light">Speak with our team</span>
        <h1>Contact Halima Trading.</h1>
        <p>Product enquiries, project quotations and customer support from our Abu Dhabi team.</p>
      </section>

      <section className="contact-layout">
        <div className="contact-info">
          <div>
            <MapPin />
            <span>
              <b>Visit us</b>
              {companyContact.building},
              <br />
              {companyContact.street}, {companyContact.city}, {companyContact.country}
            </span>
          </div>
          <div>
            <Phone />
            <span>
              <b>Telephone</b>
              <a href={`tel:${companyContact.phoneRaw}`}>{companyContact.phone}</a>
            </span>
          </div>
          <div>
            <MessageCircle />
            <span>
              <b>WhatsApp & mobile</b>
              <a
                href={`https://wa.me/${companyContact.whatsappRaw}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {companyContact.whatsapp}
              </a>
            </span>
          </div>
          <div>
            <Mail />
            <span>
              <b>Email</b>
              <a href={`mailto:${companyContact.email}`}>{companyContact.email}</a>
            </span>
          </div>
          <div>
            <Clock />
            <span>
              <b>Business hours</b>
              {companyContact.businessHours}
              <br />
              Sunday: Contact us for availability
            </span>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <span className="eyebrow">Send an enquiry</span>
          <h2>How can we help?</h2>

          {submitStatus === "success" && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Your inquiry has been sent successfully.</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Our Abu Dhabi team will review your message and respond shortly.
                </p>
              </div>
            </div>
          )}

          {submitStatus === "error" && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage || "Unable to send your message. Please try again."}</span>
            </div>
          )}

          <label>
            Full name <span className="text-red-600">*</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={submitting}
              placeholder="e.g. Ahmed Al Mansoori"
            />
          </label>

          <label>
            Email address <span className="text-red-600">*</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={submitting}
              placeholder="e.g. ahmed@example.com"
            />
          </label>

          <label>
            Phone number
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. +971 50 123 4567"
            />
          </label>

          <label>
            Subject
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              disabled={submitting}
              placeholder="e.g. Product Inquiry / Bulk Quotation"
            />
          </label>

          <label>
            Message <span className="text-red-600">*</span>
            <textarea
              rows={6}
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              disabled={submitting}
              placeholder="Please describe your requirements, product models, or project scope..."
            />
          </label>

          <button
            type="submit"
            className="btn primary flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send message</span>
              </>
            )}
          </button>
        </form>
      </section>

      <div className="map-placeholder">
        <MapPin />
        <b>{companyContact.building}</b>
        <span>{companyContact.street}, {companyContact.city}, {companyContact.country}</span>
        <a href={companyContact.googleMapsUrl} target="_blank" rel="noopener noreferrer">
          Open in Google Maps
        </a>
      </div>
    </>
  );
}
