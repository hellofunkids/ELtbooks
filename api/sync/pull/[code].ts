import { getEntry } from "../../lib/supabase";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const code = String(req.query.code ?? "").toUpperCase().trim();
    const entry = await getEntry(code);

    if (!entry) {
      res.status(404).json({ error: "코드를 찾을 수 없습니다. 코드가 만료됐거나 잘못됐습니다." });
      return;
    }

    res.status(200).json({ data: entry.data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "서버 오류가 발생했습니다." });
  }
}
