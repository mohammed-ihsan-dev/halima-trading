"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeCatalogueReturnPath } from "@/lib/catalogue-query";

/**
 * "Shop" link on a product page. Returns to the listing the product was opened from
 * (?from=/shop?page=7&category=…) after validating it as an internal shop path; a direct
 * visit or an invalid value falls back to /shop.
 */
export default function BackToCatalogueLink({ children = "Shop" }: { children?: React.ReactNode }) {
  const from = useSearchParams().get("from");
  return <Link href={safeCatalogueReturnPath(from, "/shop") ?? "/shop"}>{children}</Link>;
}
