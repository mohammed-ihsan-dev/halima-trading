import { realImages } from "@/lib/admin-gallery";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { PLACEHOLDER_IMAGE } from "@/lib/repositories/products";
import { validateProductImages } from "@/lib/product-images";
import { getImageStorage, imageRuleStorageContext } from "@/lib/image-storage";
import { releaseUnreferencedImages } from "@/lib/image-storage-cleanup";
import {
  getMongoProducts,
  getMongoProductByIdOrSlug,
  getProductPublicationFacts,
  getStoredProductImages,
  createMongoProduct,
  updateMongoProduct,
  deleteMongoProduct,
  queryMongoProducts,
} from "@/lib/repositories/products";
import { parseCatalogueParams } from "@/lib/catalogue-query";

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

const EDITABLE_STATUSES = new Set(["active", "draft", "inactive"]);

export async function GET(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  // Single product for the Edit page, including drafts the public API hides.
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  if (id) {
    const product = await getMongoProductByIdOrSlug(id, { includeUnpublished: true });
    if (!product) return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    return NextResponse.json({ success: true, product }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    // ?page=… — one page from MongoDB for the product list. Without it, the full list as before
    // (still used by other admin screens).
    if (searchParams.has("page")) {
      const { products, ...pagination } = await queryMongoProducts(parseCatalogueParams(searchParams), { includeUnpublished: true });
      return NextResponse.json(
        { success: true, data: products, total: pagination.totalProducts, pagination },
        { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } }
      );
    }
    const productsList = await getMongoProducts({ includeUnpublished: true });
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
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    if (body.deliveryRate !== undefined && body.deliveryRate !== null) {
      const numRate = Number(body.deliveryRate);
      if (isNaN(numRate) || !isFinite(numRate) || numRate < 0) {
        return NextResponse.json({ error: "Delivery rate must be a valid non-negative number" }, { status: 400 });
      }
      body.deliveryRate = numRate;
    }

    if (Array.isArray(body.images)) {
      body.images = realImages(body.images); // drops empty entries and the display placeholder
      const imageProblem = validateProductImages(body.images, { ...imageRuleStorageContext() });
      if (imageProblem) return NextResponse.json({ error: imageProblem }, { status: 400 });
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

    if (updates.deliveryRate !== undefined && updates.deliveryRate !== null) {
      const numRate = Number(updates.deliveryRate);
      if (isNaN(numRate) || !isFinite(numRate) || numRate < 0) {
        return NextResponse.json({ error: "Delivery rate must be a valid non-negative number" }, { status: 400 });
      }
      updates.deliveryRate = numRate;
    }

    let previousImages: string[] = [];
    if (Array.isArray(updates.images)) {
      updates.images = realImages(updates.images); // drops empty entries and the display placeholder
      previousImages = await getStoredProductImages(id);
      const imageProblem = validateProductImages(updates.images, {
        ...imageRuleStorageContext(),
        storedImages: previousImages,
      });
      if (imageProblem) return NextResponse.json({ error: imageProblem }, { status: 400 });
    }

    if (updates.status !== undefined) {
      if (typeof updates.status !== "string" || !EDITABLE_STATUSES.has(updates.status)) {
        return NextResponse.json({ error: 'Status must be "active", "draft" or "inactive"' }, { status: 400 });
      }
      // Publishing (anything → active) needs a real price and a real image. Products that are
      // already active are not affected, so existing listings keep working as before.
      if (updates.status === "active") {
        const facts = await getProductPublicationFacts(id);
        if (!facts) return NextResponse.json({ error: "Product not found" }, { status: 404 });
        if (facts.status !== "active") {
          const price = updates.price !== undefined ? Number(updates.price) : facts.price;
          const realImages = Array.isArray(updates.images)
            ? updates.images.filter((i: string) => i !== PLACEHOLDER_IMAGE).length
            : facts.realImageCount;
          const missing = [
            !(typeof price === "number" && price > 0) && "a price above AED 0",
            !(realImages > 0) && "at least one product image",
          ].filter(Boolean);
          if (missing.length) {
            return NextResponse.json(
              { error: `This product cannot be published yet. Add ${missing.join(" and ")} first.` },
              { status: 400 }
            );
          }
        }
      }
    }

    const updated = await updateMongoProduct(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    invalidatePublicProductCaches(updated.slug);

    // Images removed by this edit: delete their stored objects only now that the product no
    // longer references them, and only if no other product does either.
    if (Array.isArray(updates.images)) {
      const removed = previousImages.filter((url) => !updates.images.includes(url));
      const configured = getImageStorage();
      if (removed.length && configured.ok) await releaseUnreferencedImages(removed, configured.storage);
    }

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
