import { NextResponse } from "next/server";
import { getMongoOrdersByPhone } from "@/lib/repositories/orders";
import { getOtpSession } from "@/lib/otp-auth";
import { normalizePhoneNumber } from "@/lib/phone-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const status = (searchParams.get("status") || "ALL").toUpperCase();

    const otpSession = await getOtpSession();

    if (!otpSession || !otpSession.phone) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED_OTP_REQUIRED",
          message: "Please enter your mobile number and verify via OTP to view your orders.",
        },
        { status: 401 }
      );
    }

    const verifiedMobile = normalizePhoneNumber(otpSession.phone);

    // Direct MongoDB Database Query strictly filtered by verifiedMobile
    const userOrders = await getMongoOrdersByPhone(verifiedMobile);

    return processAndPagulateOrders(userOrders, page, limit, status, verifiedMobile);
  } catch (error: any) {
    console.error("Error in GET /api/my-orders:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to retrieve orders." },
      { status: 500 }
    );
  }
}

function processAndPagulateOrders(
  ordersList: any[],
  page: number,
  limit: number,
  status: string,
  verifiedPhone?: string
) {
  let filtered = ordersList;

  if (status !== "ALL") {
    filtered = filtered.filter((o) => {
      const ordStat = (o.orderStatus || "").toUpperCase();
      const payStat = (o.paymentStatus || "").toUpperCase();
      if (status === "PROCESSING") return ordStat === "PROCESSING" || ordStat === "PENDING";
      if (status === "COMPLETED") return ordStat === "SHIPPED" || ordStat === "DELIVERED";
      if (status === "CANCELLED") return ordStat === "CANCELLED";
      if (status === "FAILED") return payStat === "FAILED" || ordStat === "FAILED";
      if (status === "REFUNDED") return payStat === "REFUNDED" || payStat === "PARTIALLY_REFUNDED";
      return ordStat === status || payStat === status;
    });
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginatedOrders = filtered.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    success: true,
    verifiedPhone,
    orders: paginatedOrders,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}
