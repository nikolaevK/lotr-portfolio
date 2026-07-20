import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

// Read at request time so MP3s dropped into public/audio/ after a build
// are picked up without rebuilding.
export const dynamic = "force-dynamic";

// s-maxage lets the CDN absorb repeated hits (this is the app's only billable
// function, so uncached it is the easy usage-drain target); the deploy
// filesystem is immutable in production, so hourly freshness costs nothing.
// Local `next start` has no CDN cache, keeping the drop-in-MP3 workflow.
const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET() {
  try {
    const files = await readdir(join(process.cwd(), "public", "audio"));
    return NextResponse.json({ files: files.filter((f) => f.endsWith(".mp3")) }, { headers: CACHE });
  } catch {
    return NextResponse.json({ files: [] }, { headers: CACHE });
  }
}
