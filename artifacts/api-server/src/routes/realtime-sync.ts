import { Router, type IRouter } from "express";
import { db, syncRoomsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { toSyncData, mergeSyncData } from "@workspace/sync-core";
import { persistThumbnails, openThumbnail } from "../lib/sync-assets";
import { subscribeToRoom } from "../lib/sync-notifications";
import { UpdateSyncRoomBody } from "@workspace/api-zod";

const router: IRouter = Router();
// Preserve existing analysis fields: the generated object validator otherwise strips extras.
const payloadSchema = UpdateSyncRoomBody.extend({
  library: UpdateSyncRoomBody.shape.library.unwrap().element.passthrough().array().optional(),
});
router.use("/sync", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.param("roomId", (_req, res, next, roomId: string) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(roomId)) { res.status(400).json({ error: "유효하지 않은 동기화 코드입니다." }); return; }
  next();
});
const unavailable = "실시간 저장소 연결에 실패했습니다. 이 기기의 자료는 유지되며 연결되면 다시 전송합니다.";

router.get("/sync/room/:roomId", async (req, res) => {
  try {
    const [room] = await db.select().from(syncRoomsTable).where(eq(syncRoomsTable.id, req.params.roomId!));
    res.json({ data: toSyncData(room?.data), revision: room?.revision ?? 0, storage: "replit" });
  } catch (error) {
    req.log.error({ err: error }, "Sync room read failed");
    res.status(503).json({ error: unavailable });
  }
});
router.put("/sync/room/:roomId", async (req, res) => {
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "동기화 데이터 형식이 올바르지 않습니다." }); return; }
  try {
    const roomId = req.params.roomId!;
    const incoming = await persistThumbnails(roomId, toSyncData(parsed.data));
    const room = await db.transaction(async tx => {
      await tx.insert(syncRoomsTable).values({ id: roomId }).onConflictDoNothing();
      const [existing] = await tx.select().from(syncRoomsTable).where(eq(syncRoomsTable.id, roomId)).for("update");
      const data = mergeSyncData(toSyncData(existing!.data), incoming);
      const current = toSyncData(existing!.data);
      if (JSON.stringify(current) === JSON.stringify(data)) return { ...existing!, data };
      const revision = existing!.revision + 1;
      const [updated] = await tx.update(syncRoomsTable).set({
        data: data as unknown as Record<string, unknown>, revision, updatedAt: new Date(),
      }).where(eq(syncRoomsTable.id, roomId)).returning();
      await tx.execute(sql`SELECT pg_notify('elt_sync_changed', ${JSON.stringify({ roomId, revision })})`);
      return { ...updated!, data };
    });
    res.json({ data: room.data, revision: room.revision, storage: "replit" });
  } catch (error) {
    req.log.error({ err: error }, "Sync room write failed");
    res.status(503).json({ error: unavailable });
  }
});
router.get("/sync/events/:roomId", async (req, res) => {
  const roomId = req.params.roomId!;
  res.set({ "Content-Type": "text/event-stream", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  let closed = false;
  let checking = false;
  let revision = -1;
  const send = (event: string, value: unknown) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const changed = (next: number) => {
    if (next > revision) { revision = next; send("change", { revision }); }
  };
  const unsubscribe = subscribeToRoom(roomId, changed);
  const check = async () => {
    if (closed || checking) return;
    checking = true;
    try {
      const [room] = await db.select({ revision: syncRoomsTable.revision }).from(syncRoomsTable)
        .where(eq(syncRoomsTable.id, roomId));
      const next = room?.revision ?? 0;
      if (revision < 0) { revision = next; send("ready", { revision }); }
      else changed(next);
    } catch { send("unavailable", { error: unavailable }); }
    finally { checking = false; }
  };
  // LISTEN/NOTIFY is immediate across instances; polling recovers dropped notifications.
  const timer = setInterval(() => { if (!closed) res.write(": heartbeat\n\n"); void check(); }, 5000);
  res.on("close", () => { closed = true; clearInterval(timer); unsubscribe(); });
  await check();
});
router.get("/sync/assets/:roomId/:name", async (req, res) => {
  if (!/^[a-f0-9]{64}\.(jpeg|png|webp)$/.test(req.params.name ?? "")) { res.sendStatus(400); return; }
  try {
    const asset = await openThumbnail(req.params.roomId!, req.params.name!);
    if (!asset) { res.sendStatus(404); return; }
    res.set({ "Content-Type": asset.contentType, "Cache-Control": "private, max-age=86400" });
    asset.body.on("error", () => { if (!res.headersSent) res.sendStatus(404); else res.end(); }).pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Sync asset read failed");
    res.sendStatus(404);
  }
});
export default router;
