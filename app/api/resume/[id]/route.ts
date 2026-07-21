import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Streams a DB-stored résumé PDF. Lookup is by integer primary key (SQLite
 * rowid), so no extra index is needed. Rowids ARE reused after deletes, so the
 * content API appends ?v=<upload time> to bust CDN caches; the short s-maxage
 * below also bounds how long a deleted PDF stays downloadable.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const res = await db().execute({
    sql: "SELECT data, file_name FROM resume_variants WHERE id = ?",
    args: [id],
  });
  const row = res.rows[0];
  const data = row?.data;
  // libsql returns BLOB columns as ArrayBuffer
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name = String(row.file_name ?? "resume.pdf").replace(/[^A-Za-z0-9._-]/g, "_") || "resume.pdf";
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
