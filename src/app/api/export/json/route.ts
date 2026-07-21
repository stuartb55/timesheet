import { exportAllData } from "@/lib/data-portability";

export const dynamic = "force-dynamic";

export async function GET() {
  const exportData = await exportAllData();
  const stamp = exportData.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="flexitime-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
