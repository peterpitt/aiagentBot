import { getEnabledProviders, getDefaultProviderId } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 回傳目前「已由環境變數啟用」的供應商清單，給前端畫下拉選單。
export async function GET() {
  return Response.json({
    providers: getEnabledProviders(),
    default: getDefaultProviderId(),
  });
}
