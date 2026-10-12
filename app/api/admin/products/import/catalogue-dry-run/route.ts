import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  CatalogueFileError,
  DryRunDatabaseError,
  parseCatalogueJson,
  runCatalogueDryRun,
} from "@/lib/catalogue-dry-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // below Vercel's 4.5 MB request body limit
const noStore = { "Cache-Control": "no-store" };

/**
 * DRY RUN — NO DATABASE CHANGES.
 * POST multipart/form-data with a `file` field (JSON). Reads the products collection
 * and returns the classification report. This route has no write path.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The file is larger than 4 MB." }, { status: 413, headers: noStore });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Upload the JSON file using the dry-run form." }, { status: 400, headers: noStore });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please choose a JSON file." }, { status: 400, headers: noStore });
  }
  if (!file.name.toLowerCase().endsWith(".json")) {
    return NextResponse.json({ error: "Please upload a .json file." }, { status: 400, headers: noStore });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The file is larger than 4 MB." }, { status: 413, headers: noStore });
  }

  try {
    const { meta, records } = parseCatalogueJson(await file.text());
    const report = await runCatalogueDryRun(records, { fileName: file.name, meta });

    console.info(
      "[catalogue-dry-run]",
      JSON.stringify({
        admin: session.email,
        at: report.generatedAt,
        file: report.fileName,
        database: `${report.database.name}.${report.database.collection}`,
        existing: report.database.existingCountBefore,
        databaseUnchanged: report.database.unchanged,
        ...report.summary,
        ms: report.durationMs,
      })
    );

    if (!report.database.unchanged) {
      // Something else changed the catalogue mid-check (e.g. an order adjusting stock).
      // The dry run itself writes nothing, but the comparison is not trustworthy — say so.
      return NextResponse.json(
        {
          error:
            "The product catalogue changed while the dry run was reading it, so this report is not consistent. Nothing was written by the dry run. Please run it again.",
          database: report.database,
        },
        { status: 409, headers: noStore }
      );
    }
    return NextResponse.json({ success: true, report }, { headers: noStore });
  } catch (error) {
    if (error instanceof CatalogueFileError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: noStore });
    }
    if (error instanceof DryRunDatabaseError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: noStore });
    }
    console.error("Catalogue dry run failed:", error);
    return NextResponse.json({ error: "The dry run could not be completed." }, { status: 500, headers: noStore });
  }
}
