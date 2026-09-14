import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getMongoProducts,
  createMongoProduct,
  updateMongoProduct,
  deleteMongoProduct,
} from "@/lib/repositories/products";

export const revalidate = 0;

function invalidatePublicProductCaches(slug?: string) {
  try {
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/categories");
    revalidatePath("/brands");
    if (slug) {
      revalidatePath(`/shop/${slug}`);
    }
  } catch (err) {
    console.warn("Cache revalidation error:", err);
  }
}

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const productsList = await getMongoProducts();
    return NextResponse.json(
      {
        success: true,
        data: productsList,
        total: productsList.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching admin products from MongoDB:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products from MongoDB" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    const created = await createMongoProduct(body);
    invalidatePublicProductCaches(created.slug);

    return NextResponse.json(
      {
        success: true,
        message: "Product added successfully",
        product: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating product via Admin API:", error);
    return NextResponse.json({ error: "Invalid product data payload" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const updated = await updateMongoProduct(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    invalidatePublicProductCaches(updated.slug);

    return NextResponse.json({
      success: true,
      message: "Product updated successfully",
      product: updated,
    });
  } catch (error) {
    console.error("Error updating product via Admin API:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
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
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const deleted = await deleteMongoProduct(id);
    if (!deleted) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    invalidatePublicProductCaches();

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product via Admin API:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
