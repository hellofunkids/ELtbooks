import { getEntry, upsertEntry, mergeData, toSyncData } from "../../lib/supabase";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const code = String(req.query.code ?? "").toUpperCase().trim();
    if (code.length !== 6) {
      res.status(400).json({ error: "잘못된 코드 형식입니다." });
      return;
    }

    const entry = await getEntry(code);
    if (!entry) {
      res.status(404).json({ error: "코드를 찾을 수 없습니다. 코드가 만료됐거나 잘못됐습니다." });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const incoming = toSyncData(body?.data);
    const merged = mergeData(entry.data, incoming);

    await upsertEntry(code, merged, entry.created_at);

    res.status(200).json({ data: merged });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "서버 오류가 발생했습니다." });
  }
}
