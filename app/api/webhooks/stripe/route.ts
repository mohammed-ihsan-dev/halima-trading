import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { updateMongoPaymentStatus } from "@/lib/repositories/payments";
import { updateMongoOrderPaymentStatus } from "@/lib/repositories/orders";

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  let event: any;

  try {
    const rawBody = await request.text();
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const orderId = metadata.orderId;
      const paymentId = metadata.paymentId;
      const providerPaymentId = session.payment_intent as string;

      if (paymentId) {
        await updateMongoPaymentStatus(paymentId, "PAID", providerPaymentId);
      }
      if (orderId) {
        await updateMongoOrderPaymentStatus(orderId, "PAID", paymentId);
      }
      console.log(`Successfully processed Stripe payment for order ${orderId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing Stripe webhook event:", error);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
