import { generateCode, toSyncData, upsertEntry, codeExists } from "../lib/supabase";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const raw = body?.data;
    if (!raw) {
      res.status(400).json({ error: "data 필드가 필요합니다." });
      return;
    }

    const data = toSyncData(raw);

    let code = generateCode();
    for (let i = 0; i < 10; i++) {
      if (!(await codeExists(code))) break;
      code = generateCode();
    }

    await upsertEntry(code, data);
    res.status(200).json({ code });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "서버 오류가 발생했습니다." });
  }
}
