import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/server/db";
import { guard } from "@/server/crud";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Make this variant the default (exactly one default at a time). */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  // confirm the row exists before clearing the current default
  const exists = await db().execute({ sql: "SELECT 1 FROM resume_variants WHERE id = ?", args: [id] });
  if (exists.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db().batch(
    [
      { sql: "UPDATE resume_variants SET is_default = 0", args: [] },
      { sql: "UPDATE resume_variants SET is_default = 1 WHERE id = ?", args: [id] },
    ],
    "write",
  );
  revalidateTag("content");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const res = await db().execute({
    sql: "DELETE FROM resume_variants WHERE id = ? RETURNING id",
    args: [id],
  });
  if (res.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  revalidateTag("content");
  return NextResponse.json({ ok: true });
}
