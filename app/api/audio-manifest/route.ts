import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

// Read at request time so MP3s dropped into public/audio/ after a build
// are picked up without rebuilding.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await readdir(join(process.cwd(), "public", "audio"));
    return NextResponse.json({ files: files.filter((f) => f.endsWith(".mp3")) });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
