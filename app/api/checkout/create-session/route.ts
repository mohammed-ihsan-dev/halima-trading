import { NextResponse } from "next/server";
import { createMongoOrder } from "@/lib/repositories/orders";
import { createMongoPayment } from "@/lib/repositories/payments";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      items,
      customerName,
      customerEmail,
      customerPhone,
      company,
      shippingAddress,
      customerNotes,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart items are required" }, { status: 400 });
    }
    if (!customerName || !customerEmail || !customerPhone || !shippingAddress) {
      return NextResponse.json({ error: "Customer details and shipping address are required" }, { status: 400 });
    }

    // 1. Create order in MongoDB (validates products and stock server-side)
    const order = await createMongoOrder({
      customerName,
      customerEmail,
      customerPhone,
      company,
      shippingAddress,
      items,
      customerNotes,
    });

    // 2. Create pending payment record in MongoDB
    const payment = await createMongoPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      amount: order.totalAmount,
      currency: order.currency,
      provider: "stripe",
      status: "PENDING",
    });

    const origin = request.headers.get("origin") || "http://localhost:3000";

    // 3. Create Stripe Checkout Session if configured
    if (isStripeConfigured() && stripe) {
      const lineItems = order.items.map((item) => ({
        price_data: {
          currency: "aed",
          product_data: {
            name: item.name,
            images: item.image ? [`${origin}${item.image}`] : [],
          },
          unit_amount: Math.round(item.unitPrice * 100), // amount in fills
        },
        quantity: item.quantity,
      }));

      // Add VAT line item if applicable
      if (order.vat > 0) {
        lineItems.push({
          price_data: {
            currency: "aed",
            product_data: {
              name: "VAT (5%)",
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
        success_url: `${origin}/checkout/success?orderId=${order.id}`,
        cancel_url: `${origin}/cart`,
        customer_email: order.customerEmail,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: payment.id,
        },
      });

      return NextResponse.json({
        success: true,
        url: session.url,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    }

    // Return success response if Stripe live keys are not set yet
    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      message: "Order placed successfully in MongoDB (Stripe pending live credentials)",
    });
  } catch (error: any) {
    console.error("Checkout creation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
