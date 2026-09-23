import { NextResponse } from "next/server";
import { getMongoOrderByIdAndPhone } from "@/lib/repositories/orders";
import { getOtpSession } from "@/lib/otp-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Order ID is required." }, { status: 400 });
    }

    const otpSession = await getOtpSession();

    if (!otpSession || !otpSession.phone) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED_OTP_REQUIRED", message: "OTP verification required." },
        { status: 401 }
      );
    }

    // Direct MongoDB Database Query matching both requested orderId AND verified mobile number
    const order = await getMongoOrderByIdAndPhone(orderId, otpSession.phone);
    if (!order) {
      // Safe 404 Not Found: does not reveal whether the order belongs to another customer
      return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error: any) {
    console.error("Error in GET /api/my-orders/[orderId]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to retrieve order details." },
      { status: 500 }
    );
  }
}
