import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const syncRoomsTable = pgTable("elt_sync_rooms", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertSyncRoomSchema = createInsertSchema(syncRoomsTable).omit({ updatedAt: true });
export type InsertSyncRoom = z.infer<typeof insertSyncRoomSchema>;
export type SyncRoom = typeof syncRoomsTable.$inferSelect;
