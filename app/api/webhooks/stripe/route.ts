import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { updateMongoPaymentStatus } from "@/lib/repositories/payments";
import { updateMongoOrderPaymentStatus, restoreMongoOrderStock } from "@/lib/repositories/orders";
import { isStripeEventProcessed, markStripeEventProcessed } from "@/lib/repositories/stripe-events";

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
      if (process.env.NODE_ENV === "production" || webhookSecret) {
        return NextResponse.json({ error: "Missing or invalid webhook signature/secret" }, { status: 400 });
      }
      event = JSON.parse(rawBody);
    }
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Idempotency check using MongoDB persistent store
  if (event.id) {
    const alreadyProcessed = await isStripeEventProcessed(event.id);
    if (alreadyProcessed) {
      console.log(`Stripe event ${event.id} already processed. Skipping.`);
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const orderId = metadata.orderId;
        const paymentId = metadata.paymentId;
        const providerPaymentId =
          (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ||
          session.id;

        if (paymentId) {
          await updateMongoPaymentStatus(paymentId, "PAID", providerPaymentId);
        }
        if (orderId) {
          await updateMongoOrderPaymentStatus(orderId, "PAID", paymentId);
        }
        console.log(`Webhook checkout.session.completed processed for order: ${orderId}`);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const orderId = metadata.orderId;
        const paymentId = metadata.paymentId;

        if (paymentId) {
          await updateMongoPaymentStatus(paymentId, "FAILED");
        }
        if (orderId) {
          await restoreMongoOrderStock(orderId);
        }
        console.log(`Webhook checkout.session.expired processed for order: ${orderId}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        const metadata = paymentIntent.metadata || {};
        const orderId = metadata.orderId;
        const paymentId = metadata.paymentId;

        if (paymentId) {
          await updateMongoPaymentStatus(paymentId, "FAILED");
        }
        if (orderId) {
          await updateMongoOrderPaymentStatus(orderId, "FAILED");
        }
        console.log(`Webhook payment_intent.payment_failed processed for order: ${orderId}`);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const metadata = charge.metadata || {};
        const paymentId = metadata.paymentId;
        const orderId = metadata.orderId;

        const isPartial = charge.amount_refunded > 0 && charge.amount_refunded < charge.amount;
        const newStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";

        if (paymentId) {
          await updateMongoPaymentStatus(paymentId, newStatus);
        } else if (orderId) {
          await updateMongoOrderPaymentStatus(orderId, newStatus);
        }
        console.log(`Webhook charge.refunded processed: status ${newStatus}`);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    if (event.id) {
      await markStripeEventProcessed(event.id, event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing Stripe webhook event:", error);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}

