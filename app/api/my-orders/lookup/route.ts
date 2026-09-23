import { NextResponse } from "next/server";
import { getMongoOrderById } from "@/lib/repositories/orders";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderNumber, email } = body;

    if (!orderNumber || !email) {
      return NextResponse.json(
        { success: false, error: "Both Order Reference Number and Email are required." },
        { status: 400 }
      );
    }

    const cleanNumber = orderNumber.trim();
    const cleanEmail = email.trim().toLowerCase();

    const order = await getMongoOrderById(cleanNumber);
    if (!order) {
      return NextResponse.json(
        { success: false, error: "No order matching this reference number was found." },
        { status: 404 }
      );
    }

    // Verify email matches the order record
    if ((order.customerEmail || "").trim().toLowerCase() !== cleanEmail) {
      return NextResponse.json(
        { success: false, error: "Order reference and email combination does not match our records." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error: any) {
    console.error("Error in /api/my-orders/lookup:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Order lookup failed." },
      { status: 500 }
    );
  }
}
