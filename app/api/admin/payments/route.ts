import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getMongoPayments, refundMongoPayment } from "@/lib/repositories/payments";

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const payments = await getMongoPayments();
  return NextResponse.json({
    success: true,
    data: payments,
    total: payments.length,
  });
}

export async function POST(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { paymentId, action } = body;

    if (!paymentId || action !== "refund") {
      return NextResponse.json({ error: "Payment ID and valid action are required" }, { status: 400 });
    }

    const refunded = await refundMongoPayment(paymentId);
    if (!refunded) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Refund processed successfully via server API handler",
      payment: refunded,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}

