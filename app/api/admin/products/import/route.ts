import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import {
  IMPORT_MAX_FILE_BYTES,
  ImportFileError,
  executeImport,
  parseImportFile,
  planImport,
} from "@/lib/product-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * POST multipart/form-data: file, action (preview | import), allowNewBrands.
 *
 * Both actions parse and validate the uploaded file from scratch on the server.
 * "preview" only reads MongoDB; "import" is the only path that writes, and it only
 * inserts new products — rows whose SKU already exists are skipped, never updated.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > IMPORT_MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: `The file is larger than ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB.` },
      { status: 413, headers: noStore }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload a file using the import form." }, { status: 400, headers: noStore });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please choose a CSV or Excel (.xlsx) file." }, { status: 400, headers: noStore });
  }
  const action = form.get("action") === "import" ? "import" : "preview";
  const allowNewBrands = form.get("allowNewBrands") === "true";

  try {
    const sheet = await parseImportFile(file.name, new Uint8Array(await file.arrayBuffer()));
    const plan = await planImport(sheet, { allowNewBrands });
    const preview = {
      fileName: plan.fileName,
      ignoredHeaders: plan.ignoredHeaders,
      summary: plan.summary,
      rows: plan.rows,
    };

    if (action === "preview") {
      return NextResponse.json({ success: true, preview }, { headers: noStore });
    }

    const startedAt = Date.now();
    const result = await executeImport(plan);

    if (result.created > 0) {
      try {
        revalidatePath("/");
        revalidatePath("/shop");
        revalidatePath("/categories");
        revalidatePath("/brands");
        revalidatePath("/shop/[slug]", "page"); // every product page in one call
      } catch (err) {
        console.warn("Cache revalidation error after product import:", err);
      }
    }

    console.info(
      "[product-import]",
      JSON.stringify({
        admin: session.email,
        at: new Date().toISOString(),
        file: plan.fileName,
        mode: "create-only",
        totalRows: plan.summary.totalRows,
        created: result.created,
        failed: result.failed.length,
        notImported: plan.summary.errors + plan.summary.duplicates + plan.summary.skippedExisting,
        ms: Date.now() - startedAt,
      })
    );

    return NextResponse.json(
      { success: result.failed.length === 0, preview, result },
      { status: result.failed.length === 0 ? 200 : 207, headers: noStore }
    );
  } catch (error) {
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: noStore });
    }
    console.error("Product import failed:", error);
    return NextResponse.json(
      {
        error:
          action === "import"
            ? "The import stopped before the database confirmed it. Some products may have been saved. Check the product list — uploading the same file again is safe and will not create duplicates."
            : "Could not validate the file against the product database. Please try again.",
      },
      { status: 500, headers: noStore }
    );
  }
}
