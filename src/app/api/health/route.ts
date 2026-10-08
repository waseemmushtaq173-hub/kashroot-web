import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  const status = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      web: "ok",
      db: "unknown",
      api_host: process.env.NEXT_PUBLIC_API_URL ? "configured" : "missing",
    }
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.services.db = "ok";
  } catch (error) {
    status.services.db = "down";
    status.status = "degraded";
  }

  return NextResponse.json(status, { status: status.status === "ok" ? 200 : 503 });
}

