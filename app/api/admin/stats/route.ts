import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getMongoDb } from "@/lib/mongodb";

export const revalidate = 0;

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const db = await getMongoDb();

    const [
      totalProducts,
      activeProducts,
      outOfStockProducts,
      totalOrders,
      pendingOrders,
      totalUsers,
      activeUsers,
      suspendedUsers,
      deletedUsers,
      capturedPayments,
      categoryStats,
    ] = await Promise.all([
      db.collection("products").countDocuments({ status: { $ne: "deleted" } }),
      db.collection("products").countDocuments({ status: { $ne: "deleted" }, inStock: true }),
      db.collection("products").countDocuments({
        status: { $ne: "deleted" },
        $or: [{ inStock: false }, { stockCount: { $lte: 0 } }],
      }),
      db.collection("orders").countDocuments(),
      db.collection("orders").countDocuments({
        $or: [{ orderStatus: "PENDING" }, { orderStatus: "Pending" }, { status: "Pending" }],
      }),
      db.collection("users").countDocuments(),
      db.collection("users").countDocuments({ status: "ACTIVE" }),
      db.collection("users").countDocuments({ status: "SUSPENDED" }),
      db.collection("users").countDocuments({ status: "DELETED" }),
      db.collection("payments").countDocuments({
        $or: [{ status: "PAID" }, { status: "Captured" }],
      }),
      db.collection("products").aggregate([
        { $match: { status: { $ne: "deleted" } } },
        {
          $group: {
            _id: "$category",
            inStock: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$inStock", true] }, { $gt: ["$stockCount", 0] }] },
                  1,
                  0,
                ],
              },
            },
            outOfStock: {
              $sum: {
                $cond: [
                  { $or: [{ $eq: ["$inStock", false] }, { $lte: ["$stockCount", 0] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]).toArray(),
    ]);

    const formattedCategories = categoryStats.map((c: any) => ({
      name: c._id || "General",
      inStock: c.inStock || 0,
      outOfStock: c.outOfStock || 0,
    }));

    return NextResponse.json(
      {
        success: true,
        stats: {
          totalProducts,
          activeProducts,
          outOfStockProducts,
          totalOrders,
          pendingOrders,
          totalUsers,
          activeUsers,
          suspendedUsers,
          deletedUsers,
          capturedPayments,
          categoryData: formattedCategories,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error computing admin stats in MongoDB:", error);
    return NextResponse.json({ success: false, error: "Failed to compute stats" }, { status: 500 });
  }
}
