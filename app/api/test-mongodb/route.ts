import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { testMongoConnection, isMongoConfigured } from "@/lib/mongodb";

export const revalidate = 0;

// Diagnostics only: admins can check the database connection; the public cannot probe it
// or read raw connection errors.
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin authentication required." }, { status: 401 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      {
        success: false,
        configured: false,
        message: "MONGODB_URI environment variable is not configured yet.",
      },
      { status: 200 }
    );
  }

  const result = await testMongoConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
