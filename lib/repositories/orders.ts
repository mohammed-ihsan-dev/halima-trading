import { getMongoDb } from "@/lib/mongodb";
import { getMongoProductByIdOrSlug } from "@/lib/repositories/products";
import { normalizePhoneNumber, extractPhoneDigits } from "@/lib/phone-utils";

export interface MongoOrderItem {
  productId: string;
  sku: string;
  name: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface MongoOrderDoc {
  _id?: any;
  id: string;
  orderNumber: string;
  userId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  company?: string;
  shippingAddress: {
    address: string;
    city: string;
    emirate: string;
    country: string;
  };
  billingAddress?: {
    address: string;
    city: string;
    emirate: string;
    country: string;
  };
  items: MongoOrderItem[];
  subtotal: number;
  vat: number; // taxAmount
  taxAmount: number;
  shipping: number;
  totalAmount: number;
  currency: string;
  orderStatus: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "Pending" | "Paid" | "Shipped" | "Cancelled";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "UNPAID" | "Captured" | "Failed" | "Refunded" | "Unpaid";
  paymentId?: string;
  source?: "WEBSITE" | "EXTERNAL";
  stripePaymentLinkId?: string;
  stripePaymentLinkUrl?: string;
  customerNotes?: string;
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

function formatOrder(doc: any): MongoOrderDoc {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id: rest.id || String(_id),
    orderNumber: rest.orderNumber || `HT-${rest.id}`,
    customerName: rest.customerName || "Customer",
    customerEmail: rest.customerEmail || "",
    customerPhone: rest.customerPhone || "",
    company: rest.company || "Individual",
    shippingAddress: rest.shippingAddress || { address: "", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
    items: Array.isArray(rest.items) ? rest.items : [],
    subtotal: rest.subtotal ?? 0,
    vat: rest.vat ?? rest.taxAmount ?? 0,
    taxAmount: rest.taxAmount ?? rest.vat ?? 0,
    shipping: rest.shipping ?? 0,
    totalAmount: rest.totalAmount ?? 0,
    currency: rest.currency || "AED",
    orderStatus: rest.orderStatus || rest.status || "PENDING",
    paymentStatus: rest.paymentStatus || "UNPAID",
    source: rest.source || "WEBSITE",
    stripePaymentLinkId: rest.stripePaymentLinkId,
    stripePaymentLinkUrl: rest.stripePaymentLinkUrl,
    createdAt: rest.createdAt ? new Date(rest.createdAt) : new Date(),
    updatedAt: rest.updatedAt ? new Date(rest.updatedAt) : new Date(),
  };
}

const initialSeedOrders: Partial<MongoOrderDoc>[] = [
  {
    id: "ord-101",
    orderNumber: "HT-10001",
    customerName: "Al Serkal Group",
    customerEmail: "procurement@alserkal.ae",
    customerPhone: "+971 50 123 4567",
    company: "Al Serkal Group",
    shippingAddress: {
      address: "Al Hamra Plaza Hotel Building, Electra Street",
      city: "Abu Dhabi",
      emirate: "Abu Dhabi",
      country: "UAE",
    },
    items: [
      {
        productId: "p-hisense-ac-15",
        name: "Hisense 1.5 Ton Window Air Conditioner",
        sku: "HT-AC-001",
        quantity: 5,
        unitPrice: 1490,
        total: 7450,
        image: "/featured/hisense-window-ac.png",
      },
    ],
    subtotal: 7095.24,
    taxAmount: 354.76,
    vat: 354.76,
    shipping: 0,
    totalAmount: 7450,
    currency: "AED",
    orderStatus: "SHIPPED",
    paymentStatus: "PAID",
    trackingNumber: "DHL-9921029381",
  },
  {
    id: "ord-102",
    orderNumber: "HT-10002",
    customerName: "Emirates Contracting L.L.C.",
    customerEmail: "orders@emiratescontracting.ae",
    customerPhone: "+971 52 987 6543",
    company: "Emirates Contracting",
    shippingAddress: {
      address: "Musaffah Industrial Area M-14",
      city: "Abu Dhabi",
      emirate: "Abu Dhabi",
      country: "UAE",
    },
    items: [
      {
        productId: "p-super-general-wash",
        name: "Super General 15 KG Twin-Tub Washing Machine",
        sku: "HT-LA-005",
        quantity: 3,
        unitPrice: 1940,
        total: 5820,
        image: "/featured/super-general-twin-tub.png",
      },
    ],
    subtotal: 5542.86,
    taxAmount: 277.14,
    vat: 277.14,
    shipping: 0,
    totalAmount: 5820,
    currency: "AED",
    orderStatus: "PENDING",
    paymentStatus: "UNPAID",
  },
  {
    id: "ord-103",
    orderNumber: "HT-10003",
    customerName: "Mahnoush Hospitality",
    customerEmail: "purchasing@mahnoush.ae",
    customerPhone: "+971 56 444 3322",
    company: "Mahnoush Group",
    shippingAddress: {
      address: "Corniche Road, Sector 1",
      city: "Abu Dhabi",
      emirate: "Abu Dhabi",
      country: "UAE",
    },
    items: [
      {
        productId: "p-water-dispenser-black",
        name: "Black Bottom-Loading Water Dispenser",
        sku: "HT-HO-010",
        quantity: 10,
        unitPrice: 420,
        total: 4200,
        image: "/featured/black-water-dispenser.png",
      },
    ],
    subtotal: 4000,
    taxAmount: 200,
    vat: 200,
    shipping: 0,
    totalAmount: 4200,
    currency: "AED",
    orderStatus: "PROCESSING",
    paymentStatus: "PAID",
  },
  {
    id: "ord-104",
    orderNumber: "HT-10004",
    customerName: "Rashid Al Mansoori",
    customerEmail: "ralmansoori@gmail.com",
    customerPhone: "+971 50 888 7766",
    shippingAddress: {
      address: "Villa 42, Al Bateen",
      city: "Abu Dhabi",
      emirate: "Abu Dhabi",
      country: "UAE",
    },
    items: [
      {
        productId: "p-ogeneral-split-ac",
        name: "O General 2 Ton Split Air Conditioner",
        sku: "HT-AC-002",
        quantity: 1,
        unitPrice: 2150,
        total: 2150,
        image: "/featured/ogeneral-split-indoor.png",
      },
    ],
    subtotal: 2047.62,
    taxAmount: 102.38,
    vat: 102.38,
    shipping: 0,
    totalAmount: 2150,
    currency: "AED",
    orderStatus: "CANCELLED",
    paymentStatus: "REFUNDED",
  },
];

export async function ensureOrdersSeeded(): Promise<void> {
  try {
    const db = await getMongoDb();
    const count = await db.collection("orders").countDocuments();
    if (count === 0) {
      await db.collection("orders").createIndex({ orderNumber: 1 }, { unique: true });
      await db.collection("orders").createIndex({ userId: 1 });
      await db.collection("orders").createIndex({ customerPhone: 1, createdAt: -1 });
      await db.collection("orders").createIndex({ orderStatus: 1 });
      await db.collection("orders").createIndex({ paymentStatus: 1 });
      await db.collection("orders").createIndex({ createdAt: -1 });

      const docs = initialSeedOrders.map((o) => ({
        ...o,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.collection("orders").insertMany(docs as any);
      console.log("Seeded initial MongoDB orders collection successfully.");
    }
  } catch (error) {
    console.error("Error seeding orders collection:", error);
  }
}

export async function getMongoOrders(): Promise<MongoOrderDoc[]> {
  try {
    await ensureOrdersSeeded();
    const db = await getMongoDb();
    const docs = await db.collection("orders").find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(formatOrder);
  } catch (error) {
    console.error("Error fetching orders from MongoDB:", error);
    return [];
  }
}

/**
 * Fetch orders directly from MongoDB matching verified customer phone number.
 * Uses MongoDB database query directly without in-memory filtering.
 */
export async function getMongoOrdersByPhone(rawPhone: string): Promise<MongoOrderDoc[]> {
  try {
    await ensureOrdersSeeded();
    const norm = normalizePhoneNumber(rawPhone);
    const digits = extractPhoneDigits(rawPhone);
    if (!digits) return [];

    const db = await getMongoDb();

    // Anchored regex pattern for exact sequence of digits (allowing optional +, spaces, dashes, dots)
    const digitPattern = "^\\+?[\\s\\-\\.]*" + digits.split("").join("[\\s\\-\\.]*") + "[\\s\\-\\.]*$";

    const conditions: any[] = [
      { customerPhone: norm },
      { customerPhone: rawPhone },
      { customerPhone: { $regex: digitPattern, $options: "i" } },
    ];

    if (digits.startsWith("9715") && digits.length === 12) {
      const localDigits = "0" + digits.slice(3); // e.g. 0501234567
      const localPattern = "^[\\s\\-\\.]*" + localDigits.split("").join("[\\s\\-\\.]*") + "[\\s\\-\\.]*$";
      conditions.push({ customerPhone: { $regex: localPattern, $options: "i" } });
    }

    const docs = await db
      .collection("orders")
      .find({ $or: conditions })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(formatOrder);
  } catch (error) {
    console.error(`Error fetching orders for phone (${rawPhone}) from MongoDB:`, error);
    return [];
  }
}

/**
 * Fetch specific order by ID/OrderNumber strictly verified against customer phone number in MongoDB.
 */
export async function getMongoOrderByIdAndPhone(
  idOrNumber: string,
  rawPhone: string
): Promise<MongoOrderDoc | null> {
  try {
    const userOrders = await getMongoOrdersByPhone(rawPhone);
    const matched = userOrders.find(
      (o) => o.id === idOrNumber || o.orderNumber.toLowerCase() === idOrNumber.toLowerCase()
    );
    return matched || null;
  } catch (error) {
    console.error(`Error fetching order (${idOrNumber}) for phone (${rawPhone}):`, error);
    return null;
  }
}

export async function getMongoOrderById(idOrNumber: string): Promise<MongoOrderDoc | null> {
  try {
    await ensureOrdersSeeded();
    const db = await getMongoDb();
    const doc = await db.collection("orders").findOne({
      $or: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
    });
    return doc ? formatOrder(doc) : null;
  } catch (error) {
    console.error(`Error fetching order (${idOrNumber}) from MongoDB:`, error);
    return null;
  }
}

export async function createMongoOrder(orderInput: {
  userId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  company?: string;
  shippingAddress: { address: string; city: string; emirate: string; country: string };
  billingAddress?: { address: string; city: string; emirate: string; country: string };
  items: { productId: string; quantity: number }[];
  customerNotes?: string;
  source?: "WEBSITE" | "EXTERNAL";
  stripePaymentLinkId?: string;
  stripePaymentLinkUrl?: string;
}): Promise<MongoOrderDoc> {
  await ensureOrdersSeeded();
  const db = await getMongoDb();

  if (!orderInput.items || orderInput.items.length === 0) {
    throw new Error("Order must contain at least one item.");
  }

  const processedItems: MongoOrderItem[] = [];
  let calculatedSubtotal = 0;
  let calculatedShipping = 0;

  for (const itemInput of orderInput.items) {
    const product = await getMongoProductByIdOrSlug(itemInput.productId);
    if (!product) {
      throw new Error(`Product with ID ${itemInput.productId} not found.`);
    }
    if (!product.inStock || (product.stockCount !== undefined && product.stockCount < itemInput.quantity)) {
      throw new Error(`Insufficient stock for product: ${product.name}`);
    }

    const unitPrice = product.price || 0;
    const itemTotal = unitPrice * itemInput.quantity;
    calculatedSubtotal += itemTotal;

    const itemDeliveryRate = product.deliveryRate !== undefined && product.deliveryRate !== null ? Number(product.deliveryRate) : 0;
    calculatedShipping += itemDeliveryRate * itemInput.quantity;

    processedItems.push({
      productId: product.id,
      sku: product.sku || `HT-${product.category.substring(0, 2).toUpperCase()}-001`,
      name: product.name,
      image: product.images?.[0] || "/featured/hisense-window-ac.png",
      quantity: itemInput.quantity,
      unitPrice,
      total: itemTotal,
    });

    // Inventory safety: atomic decrement stock count
    await db.collection("products").updateOne(
      { id: product.id },
      {
        $inc: { stockCount: -itemInput.quantity },
        $set: { inStock: (product.stockCount || 0) - itemInput.quantity > 0 },
      }
    );
  }

  const vat = Math.round(calculatedSubtotal * 0.05 * 100) / 100; // 5% UAE VAT
  const totalAmount = calculatedSubtotal + calculatedShipping + vat;

  const count = await db.collection("orders").countDocuments();
  const orderNumber = `HT-${10005 + count}`;
  const id = `ord-${Date.now()}`;

  const doc: MongoOrderDoc = {
    id,
    orderNumber,
    userId: orderInput.userId,
    customerName: orderInput.customerName.trim(),
    customerEmail: orderInput.customerEmail.trim(),
    customerPhone: normalizePhoneNumber(orderInput.customerPhone),
    company: orderInput.company?.trim(),
    shippingAddress: orderInput.shippingAddress,
    billingAddress: orderInput.billingAddress || orderInput.shippingAddress,
    items: processedItems,
    subtotal: calculatedSubtotal,
    vat,
    taxAmount: vat,
    shipping: calculatedShipping,
    totalAmount,
    currency: "AED",
    orderStatus: "PENDING",
    paymentStatus: "UNPAID",
    source: orderInput.source || "WEBSITE",
    stripePaymentLinkId: orderInput.stripePaymentLinkId,
    stripePaymentLinkUrl: orderInput.stripePaymentLinkUrl,
    customerNotes: orderInput.customerNotes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("orders").insertOne(doc);
  return formatOrder(doc);
}

export async function updateMongoOrderStatus(
  idOrNumber: string,
  status: MongoOrderDoc["orderStatus"],
  trackingNumber?: string
): Promise<MongoOrderDoc | null> {
  try {
    const db = await getMongoDb();
    const existing = await db.collection("orders").findOne({
      $or: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
    });
    if (!existing) return null;

    const setFields: Record<string, any> = {
      orderStatus: status,
      updatedAt: new Date(),
    };
    if (trackingNumber) setFields.trackingNumber = trackingNumber;

    if (status === "Paid" || status === "PROCESSING") {
      if (existing.paymentStatus === "UNPAID" || existing.paymentStatus === "Unpaid") {
        setFields.paymentStatus = "PAID";
      }
    }

    await db.collection("orders").updateOne({ _id: existing._id }, { $set: setFields });
    const updated = await db.collection("orders").findOne({ _id: existing._id });
    return updated ? formatOrder(updated) : null;
  } catch (error) {
    console.error(`Error updating order status (${idOrNumber}):`, error);
    return null;
  }
}

export async function updateMongoOrderPaymentStatus(
  idOrNumber: string,
  paymentStatus: MongoOrderDoc["paymentStatus"],
  paymentId?: string
): Promise<MongoOrderDoc | null> {
  try {
    const db = await getMongoDb();
    const existing = await db.collection("orders").findOne({
      $or: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
    });
    if (!existing) return null;

    const setFields: Record<string, any> = {
      paymentStatus,
      updatedAt: new Date(),
    };
    if (paymentId) setFields.paymentId = paymentId;

    if (paymentStatus === "PAID" && (existing.orderStatus === "PENDING" || existing.orderStatus === "Pending")) {
      setFields.orderStatus = "PROCESSING";
    }

    await db.collection("orders").updateOne({ _id: existing._id }, { $set: setFields });
    const updated = await db.collection("orders").findOne({ _id: existing._id });
    return updated ? formatOrder(updated) : null;
  } catch (error) {
    console.error(`Error updating order payment status (${idOrNumber}):`, error);
    return null;
  }
}

/**
 * Idempotently restores stock for an abandoned, expired, or cancelled checkout order.
 * Ensures stock is never restored twice or restored for paid orders.
 */
export async function restoreMongoOrderStock(idOrNumber: string): Promise<boolean> {
  try {
    const db = await getMongoDb();
    const existing = await db.collection("orders").findOne({
      $or: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
    });

    if (!existing) return false;

    // Idempotency check: Do not restore if already restored or paid
    if (existing.stockRestored === true || existing.paymentStatus === "PAID") {
      return false;
    }

    if (Array.isArray(existing.items)) {
      for (const item of existing.items) {
        if (item.productId && item.quantity > 0) {
          await db.collection("products").updateOne(
            { id: item.productId },
            {
              $inc: { stockCount: item.quantity },
              $set: { inStock: true },
            }
          );
        }
      }
    }

    await db.collection("orders").updateOne(
      { _id: existing._id },
      {
        $set: {
          stockRestored: true,
          orderStatus: "CANCELLED",
          paymentStatus: "FAILED",
          updatedAt: new Date(),
        },
      }
    );

    return true;
  } catch (error) {
    console.error(`Error restoring stock for order (${idOrNumber}):`, error);
    return false;
  }
}
