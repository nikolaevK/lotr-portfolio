import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/server/db";
import { guard } from "@/server/crud";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const res = await db().execute(
    // list view: everything but the blob itself
    "SELECT id, label, file_path, file_name, is_default, sort_order, length(data) AS bytes FROM resume_variants ORDER BY sort_order, id",
  );
  return NextResponse.json({ rows: res.rows });
}

/** Upload a new résumé variant (multipart: file, label, is_default). */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  const file = fd.get("file");
  const label = String(fd.get("label") ?? "").trim();
  const makeDefault = fd.get("is_default") === "1";

  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF file" }, { status: 400 });
  if (!label || label.length > 100) return NextResponse.json({ error: "Label is required (max 100 chars)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "PDF too large (max 4 MB)" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // %PDF magic — extension and MIME are client-supplied, the header is not
  if (bytes.length < 100 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    return NextResponse.json({ error: "That file is not a PDF" }, { status: 400 });
  }

  const fileName = (file.name || `${label}.pdf`).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "resume.pdf";
  try {
    const stmts = [
      {
        sql: "INSERT INTO resume_variants (label, file_path, file_name, data, is_default, uploaded_at, sort_order) VALUES (?, '', ?, ?, ?, datetime('now'), (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM resume_variants)) RETURNING id",
        args: [label, fileName, bytes, makeDefault ? 1 : 0] as (string | number | Uint8Array)[],
      },
    ];
    if (makeDefault) stmts.unshift({ sql: "UPDATE resume_variants SET is_default = 0", args: [] });
    const res = await db().batch(stmts, "write");
    revalidateTag("content");
    return NextResponse.json({ id: Number(res[res.length - 1].rows[0].id) }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && /UNIQUE/i.test(e.message) ? "A variant with that label already exists" : "Database rejected the upload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
