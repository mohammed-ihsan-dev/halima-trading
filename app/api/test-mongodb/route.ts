import { NextResponse } from "next/server";
import { testMongoConnection, isMongoConfigured } from "@/lib/mongodb";

export const revalidate = 0;

export async function GET() {
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
