import { NextResponse } from "next/server";
import { buildValues, dbc, entityOr404, guard } from "@/server/crud";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { entity, id } = await ctx.params;
  const def = entityOr404(entity);
  if (!def) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const built = buildValues(def, payload, true);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  try {
    const res = await dbc().execute({
      sql: `UPDATE ${def.table} SET ${built.cols.map((c) => `${c} = ?`).join(", ")} WHERE ${def.pk} = ? RETURNING *`,
      args: [...built.vals, id],
    });
    if (res.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ row: res.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: dbError(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { entity, id } = await ctx.params;
  const def = entityOr404(entity);
  if (!def) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  try {
    const res = await dbc().execute({
      sql: `DELETE FROM ${def.table} WHERE ${def.pk} = ? RETURNING ${def.pk}`,
      args: [id],
    });
    if (res.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: dbError(e) }, { status: 400 });
  }
}

function dbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^.*SQLITE_[A-Z_]+:?\s*/, "Database rejected the change: ");
}
