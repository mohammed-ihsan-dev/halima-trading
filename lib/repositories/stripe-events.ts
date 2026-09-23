import { getMongoDb } from "@/lib/mongodb";

export interface StripeWebhookEventDoc {
  _id?: any;
  eventId: string;
  eventType: string;
  processedAt: Date;
}

let eventIndexEnsured = false;

async function ensureEventIndex() {
  if (eventIndexEnsured) return;
  try {
    const db = await getMongoDb();
    await db.collection("stripe_webhook_events").createIndex({ eventId: 1 }, { unique: true });
    eventIndexEnsured = true;
  } catch {
    // Ignore index creation errors if index exists
  }
}

/**
 * Check if a Stripe webhook event ID has already been processed (Idempotency Check)
 */
export async function isStripeEventProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    await ensureEventIndex();
    const db = await getMongoDb();
    const existing = await db.collection("stripe_webhook_events").findOne({ eventId });
    return Boolean(existing);
  } catch (error) {
    console.error("Error checking Stripe webhook event idempotency:", error);
    return false;
  }
}

/**
 * Record a Stripe webhook event ID as processed
 */
export async function markStripeEventProcessed(eventId: string, eventType: string): Promise<void> {
  if (!eventId) return;
  try {
    await ensureEventIndex();
    const db = await getMongoDb();
    await db.collection("stripe_webhook_events").updateOne(
      { eventId },
      { $set: { eventId, eventType, processedAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    console.error("Error marking Stripe webhook event as processed:", error);
  }
}
