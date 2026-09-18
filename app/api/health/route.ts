import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import packageJson from "../../../package.json";

// Used by the Docker healthcheck (see docker-compose.yml) and by anyone
// checking whether this install is up and which version it's running.
// No auth required: it reveals no business data, only liveness + version.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", version: packageJson.version });
  } catch {
    return NextResponse.json({ status: "error", version: packageJson.version }, { status: 503 });
  }
}
