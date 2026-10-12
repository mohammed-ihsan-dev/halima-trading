import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { buildCsvTemplate, buildXlsxTemplate, listKnownBrands } from "@/lib/product-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (format === "csv") {
    return new NextResponse(buildCsvTemplate(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="halima-product-import-template.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildXlsxTemplate(await listKnownBrands());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="halima-product-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
