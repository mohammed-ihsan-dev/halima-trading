import { NextResponse } from "next/server";
import {
  getMongoProducts,
  getMongoProductByIdOrSlug,
  getMongoFeaturedProducts,
  getMongoProductsByCategory,
} from "@/lib/repositories/products";

export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const id = searchParams.get("id");
    const category = searchParams.get("category");
    const featured = searchParams.get("featured");

    if (slug || id) {
      const product = await getMongoProductByIdOrSlug(slug || id || "");
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      return NextResponse.json(
        { success: true, product },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        }
      );
    }

    let products = [];
    if (category && category !== "All") {
      products = await getMongoProductsByCategory(category);
    } else if (featured === "true") {
      products = await getMongoFeaturedProducts();
    } else {
      products = await getMongoProducts();
    }

    return NextResponse.json(
      {
        success: true,
        data: products,
        total: products.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error in public products API:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
