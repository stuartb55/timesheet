import { NextRequest, NextResponse } from "next/server";

const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host || !allowedHosts.has(hostname(host) ?? "")) {
    return new NextResponse("Unrecognised host", { status: 421 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
