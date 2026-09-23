import { NextResponse } from "next/server";
import { getMongoOrderById } from "@/lib/repositories/orders";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const order = await getMongoOrderById(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        company: order.company,
        shippingAddress: order.shippingAddress,
        deliveryNotes: order.customerNotes,
        subtotal: order.subtotal,
        vat: order.vat,
        totalAmount: order.totalAmount,
        currency: order.currency,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        items: order.items,
        createdAt: order.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Order status lookup error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve order status" },
      { status: 500 }
    );
  }
}
