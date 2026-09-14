import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getMongoUsers, suspendMongoUser, softDeleteMongoUser, updateMongoUser } from "@/lib/repositories/users";

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const usersList = await getMongoUsers();
  return NextResponse.json({
    success: true,
    data: usersList,
    total: usersList.length,
  });
}

export async function PATCH(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, action, status } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (action === "suspend") {
      const ok = await suspendMongoUser(id);
      if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json({ success: true, message: "User account suspended" });
    }

    if (action === "activate" || status === "ACTIVE" || status === "Active") {
      const updated = await updateMongoUser(id, { status: "ACTIVE" });
      if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json({ success: true, message: "User account activated", user: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const ok = await softDeleteMongoUser(id);
    if (!ok) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "User soft-deleted successfully",
    });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}

