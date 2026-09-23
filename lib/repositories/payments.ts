import { getMongoDb } from "@/lib/mongodb";
import { updateMongoOrderPaymentStatus } from "@/lib/repositories/orders";

export interface MongoPaymentDoc {
  _id?: any;
  id: string;
  paymentNumber: string;
  orderNumber: string;
  orderId: string;
  userId?: string;
  customerName: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "Captured" | "Failed" | "Refunded";
  provider: "stripe" | "bank_transfer" | "cash_on_delivery";
  providerPaymentId?: string;
  referenceId?: string;
  method?: string;
  refundAmount?: number;
  metadata?: Record<string, any>;
  date: string;
  createdAt: Date;
  updatedAt: Date;
}

function formatPayment(doc: any): MongoPaymentDoc {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id: rest.id || String(_id),
    paymentNumber: rest.paymentNumber || `PAY-${rest.id}`,
    orderNumber: rest.orderNumber || "",
    orderId: rest.orderId || "",
    customerName: rest.customerName || "Customer",
    amount: rest.amount ?? 0,
    currency: rest.currency || "AED",
    status: rest.status || "PENDING",
    provider: rest.provider || "stripe",
    date: rest.date || new Date().toISOString().split("T")[0],
    createdAt: rest.createdAt ? new Date(rest.createdAt) : new Date(),
    updatedAt: rest.updatedAt ? new Date(rest.updatedAt) : new Date(),
  };
}

const initialSeedPayments: Partial<MongoPaymentDoc>[] = [
  {
    id: "pay-1",
    paymentNumber: "PAY-2026-0089",
    orderNumber: "HT-10001",
    orderId: "ord-101",
    customerName: "Al Serkal Group",
    amount: 7450,
    currency: "AED",
    status: "PAID",
    provider: "bank_transfer",
    referenceId: "FT26091288921",
    date: "12 Sep 2026",
  },
  {
    id: "pay-2",
    paymentNumber: "PAY-2026-0088",
    orderNumber: "HT-10003",
    orderId: "ord-103",
    customerName: "Mahnoush Hospitality",
    amount: 4200,
    currency: "AED",
    status: "PAID",
    provider: "stripe",
    referenceId: "pi_3M0019283719283",
    date: "11 Sep 2026",
  },
  {
    id: "pay-3",
    paymentNumber: "PAY-2026-0087",
    orderNumber: "HT-10004",
    orderId: "ord-104",
    customerName: "Rashid Al Mansoori",
    amount: 2150,
    currency: "AED",
    status: "REFUNDED",
    provider: "stripe",
    referenceId: "re_3M0019283799999",
    date: "10 Sep 2026",
  },
];

export async function ensurePaymentsSeeded(): Promise<void> {
  try {
    const db = await getMongoDb();
    const count = await db.collection("payments").countDocuments();
    if (count === 0) {
      await db.collection("payments").createIndex({ paymentNumber: 1 }, { unique: true });
      await db.collection("payments").createIndex({ orderId: 1 });
      await db.collection("payments").createIndex({ orderNumber: 1 });
      await db.collection("payments").createIndex({ status: 1 });
      await db.collection("payments").createIndex({ createdAt: -1 });

      const docs = initialSeedPayments.map((p) => ({
        ...p,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.collection("payments").insertMany(docs as any);
      console.log("Seeded initial MongoDB payments collection successfully.");
    }
  } catch (error) {
    console.error("Error seeding payments collection:", error);
  }
}

export async function getMongoPayments(): Promise<MongoPaymentDoc[]> {
  try {
    await ensurePaymentsSeeded();
    const db = await getMongoDb();
    const docs = await db.collection("payments").find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(formatPayment);
  } catch (error) {
    console.error("Error fetching payments from MongoDB:", error);
    return [];
  }
}

export async function createMongoPayment(data: {
  orderId: string;
  orderNumber: string;
  userId?: string;
  customerName: string;
  amount: number;
  currency?: string;
  provider: "stripe" | "bank_transfer" | "cash_on_delivery";
  providerPaymentId?: string;
  status?: MongoPaymentDoc["status"];
  metadata?: Record<string, any>;
}): Promise<MongoPaymentDoc> {
  await ensurePaymentsSeeded();
  const db = await getMongoDb();

  const count = await db.collection("payments").countDocuments();
  const paymentNumber = `PAY-2026-${String(90 + count).padStart(4, "0")}`;
  const id = `pay-${Date.now()}`;

  const doc: MongoPaymentDoc = {
    id,
    paymentNumber,
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    userId: data.userId,
    customerName: data.customerName,
    amount: data.amount,
    currency: data.currency || "AED",
    status: data.status || "PENDING",
    provider: data.provider,
    providerPaymentId: data.providerPaymentId,
    referenceId: data.providerPaymentId,
    metadata: data.metadata,
    date: new Date().toISOString().split("T")[0],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("payments").insertOne(doc);
  return formatPayment(doc);
}

export async function updateMongoPaymentStatus(
  paymentIdOrNumber: string,
  status: MongoPaymentDoc["status"],
  providerPaymentId?: string
): Promise<MongoPaymentDoc | null> {
  try {
    const db = await getMongoDb();
    const existing = await db.collection("payments").findOne({
      $or: [{ id: paymentIdOrNumber }, { paymentNumber: paymentIdOrNumber }],
    });
    if (!existing) return null;

    const setFields: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };
    if (providerPaymentId) {
      setFields.providerPaymentId = providerPaymentId;
      setFields.referenceId = providerPaymentId;
    }

    await db.collection("payments").updateOne({ _id: existing._id }, { $set: setFields });

    if (status === "PAID" || status === "Captured") {
      await updateMongoOrderPaymentStatus(existing.orderId, "PAID", existing.id);
    } else if (status === "REFUNDED" || status === "Refunded") {
      await updateMongoOrderPaymentStatus(existing.orderId, "REFUNDED", existing.id);
    }

    const updated = await db.collection("payments").findOne({ _id: existing._id });
    return updated ? formatPayment(updated) : null;
  } catch (error) {
    console.error(`Error updating payment status (${paymentIdOrNumber}):`, error);
    return null;
  }
}

import { stripe, isStripeConfigured } from "@/lib/stripe";

export async function refundMongoPayment(paymentIdOrNumber: string): Promise<MongoPaymentDoc | null> {
  const db = await getMongoDb();
  const existing = await db.collection("payments").findOne({
    $or: [{ id: paymentIdOrNumber }, { paymentNumber: paymentIdOrNumber }],
  });

  if (!existing) return null;

  // Execute live Stripe refund via Stripe SDK if provider is stripe
  if (existing.provider === "stripe" && isStripeConfigured() && stripe) {
    const providerPaymentId = existing.providerPaymentId || existing.referenceId;
    if (providerPaymentId) {
      try {
        let paymentIntentId = providerPaymentId;
        if (providerPaymentId.startsWith("cs_")) {
          const session = await stripe.checkout.sessions.retrieve(providerPaymentId);
          if (session.payment_intent) {
            paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
          }
        }

        if (paymentIntentId.startsWith("pi_")) {
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            metadata: {
              paymentNumber: existing.paymentNumber,
              orderNumber: existing.orderNumber,
            },
          });
        }
      } catch (stripeErr: any) {
        console.error(`Stripe live refund call failed for payment (${paymentIdOrNumber}):`, stripeErr.message);
        throw new Error(`Stripe Refund Error: ${stripeErr.message}`);
      }
    }
  }

  return await updateMongoPaymentStatus(paymentIdOrNumber, "REFUNDED");
}
