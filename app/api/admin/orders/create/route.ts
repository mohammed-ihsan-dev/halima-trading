import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createMongoOrder, updateMongoOrderStatus } from "@/lib/repositories/orders";
import { createMongoPayment } from "@/lib/repositories/payments";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { getMongoDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const isAuth = await isAdminAuthenticated();
    if (!isAuth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Admin authentication required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      customerName,
      customerEmail,
      customerPhone,
      company,
      shippingAddress,
      customerNotes,
      items,
    } = body;

    if (!customerName || !customerEmail || !customerPhone) {
      return NextResponse.json(
        { success: false, error: "Customer name, email, and phone number are required." },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Order must include at least one product item." },
        { status: 400 }
      );
    }

    // Default shipping address fallback if minimal address provided
    const finalShippingAddress = shippingAddress || {
      address: "Store Pickup / Direct Delivery",
      city: "Abu Dhabi",
      emirate: "Abu Dhabi",
      country: "UAE",
    };

    // 1. Create external order in MongoDB (server fetches authoritative product prices & decrements stock)
    const order = await createMongoOrder({
      customerName,
      customerEmail,
      customerPhone,
      company,
      shippingAddress: finalShippingAddress,
      items,
      customerNotes,
      source: "EXTERNAL",
    });

    // 2. Create pending payment record in MongoDB
    const payment = await createMongoPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      amount: order.totalAmount,
      currency: order.currency || "AED",
      provider: "stripe",
      status: "PENDING",
      metadata: { source: "EXTERNAL" },
    });

    const origin = request.headers.get("origin") || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin || "http://localhost:3000";
    const baseUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;

    let paymentLinkUrl = `${baseUrl}/checkout/success?orderId=${order.id}&source=EXTERNAL`;
    let stripePaymentLinkId: string | undefined = undefined;

    // 3. Create Stripe Payment Link / Checkout Session server-side
    if (isStripeConfigured() && stripe) {
      const lineItems = order.items.map((item) => {
        let imageUrl: string | undefined = undefined;
        if (item.image) {
          imageUrl = item.image.startsWith("http")
            ? item.image
            : `${baseUrl}${item.image.startsWith("/") ? "" : "/"}${item.image}`;
        }

        return {
          price_data: {
            currency: "aed",
            product_data: {
              name: item.name,
              images: imageUrl ? [imageUrl] : [],
            },
            unit_amount: Math.round(item.unitPrice * 100), // amount in fils
          },
          quantity: item.quantity,
        };
      });

      // Add VAT (5%) line item
      if (order.vat > 0) {
        lineItems.push({
          price_data: {
            currency: "aed",
            product_data: {
              name: "UAE VAT (5%)",
              images: [],
            },
            unit_amount: Math.round(order.vat * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&orderId=${order.id}`,
        cancel_url: `${baseUrl}/checkout/cancel?orderId=${order.id}`,
        customer_email: order.customerEmail,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          paymentNumber: payment.paymentNumber,
          source: "EXTERNAL",
        },
      });

      paymentLinkUrl = session.url || paymentLinkUrl;
      stripePaymentLinkId = session.id;
    }

    // Update MongoDB order with payment link details
    const db = await getMongoDb();
    await db.collection("orders").updateOne(
      { id: order.id },
      {
        $set: {
          stripePaymentLinkUrl: paymentLinkUrl,
          stripePaymentLinkId: stripePaymentLinkId || null,
        },
      }
    );

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      vat: order.vat,
      subtotal: order.subtotal,
      paymentLinkUrl,
      paymentStatus: payment.status,
      orderStatus: order.orderStatus,
    });
  } catch (error: any) {
    console.error("Error creating external admin order:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create external order" },
      { status: 500 }
    );
  }
}
