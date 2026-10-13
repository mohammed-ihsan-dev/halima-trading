import { revalidatePath } from "next/cache";

/**
 * Stock changed outside the admin product editor (an order reserved stock, or an expired
 * checkout gave it back). Clear the cached public pages that show availability, so a sold-out
 * product does not keep appearing "In stock" for up to 60 seconds. Call only from route handlers.
 */
export function invalidateCatalogueAfterStockChange(): void {
  try {
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/shop/[slug]", "page");
  } catch (error) {
    console.warn("Catalogue cache revalidation error:", error);
  }
}
