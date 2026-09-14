import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getMongoOrders, updateMongoOrderStatus } from "@/lib/repositories/orders";

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const orders = await getMongoOrders();
  return NextResponse.json({
    success: true,
    data: orders,
    total: orders.length,
  });
}

export async function PATCH(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, trackingNumber } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "Order ID and status are required" }, { status: 400 });
    }

    const updated = await updateMongoOrderStatus(id, status, trackingNumber);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updated,
    });
  } catch {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
}

