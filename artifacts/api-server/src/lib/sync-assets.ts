import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { SyncData } from "@workspace/sync-core";

/**
 * Thumbnail storage. Thumbnail bytes go to an object store, never to the database.
 *
 * Drivers (chosen by STORAGE_DRIVER, or detected from the configured variables):
 * - "s3":     any S3-compatible store (Cloudflare R2, AWS S3, Backblaze B2, MinIO …)
 *             S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, [S3_REGION], [S3_PREFIX]
 * - "replit": the original Replit App Storage (PRIVATE_OBJECT_DIR). Kept so the existing
 *             Replit deployment keeps working during the migration.
 *
 * Object key layout is identical for both drivers: <prefix>/sync/<roomId>/<sha256>.<ext>,
 * and the public URL stays /api/sync/assets/<roomId>/<name>.
 */
export interface StoredAsset { contentType: string; body: Readable }
interface AssetDriver {
  exists(key: string): Promise<boolean>;
  /** Writes only if absent. Must not overwrite an existing object. */
  save(key: string, bytes: Buffer, contentType: string): Promise<void>;
  open(key: string): Promise<StoredAsset | null>;
}

const NOT_CONFIGURED = "이미지 저장소가 설정되지 않았습니다. 서버의 S3_* 환경변수를 확인해주세요.";

function joinKey(...parts: string[]) {
  return parts.map(part => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

function s3Driver(): AssetDriver {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) throw new Error(NOT_CONFIGURED);
  const prefix = process.env.S3_PREFIX ?? "";
  const region = process.env.S3_REGION || "auto";
  let client: Promise<import("aws4fetch").AwsClient> | undefined;
  const getClient = () => client ??= import("aws4fetch").then(({ AwsClient }) =>
    new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region }));
  // Path-style URLs work on R2, MinIO and AWS alike.
  const url = (key: string) => `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(bucket)}/${
    joinKey(prefix, key).split("/").map(encodeURIComponent).join("/")}`;
  const send = async (key: string, init: RequestInit = {}) =>
    (await getClient()).fetch(url(key), { ...init, signal: AbortSignal.timeout(30_000) });
  return {
    async exists(key) {
      const res = await send(key, { method: "HEAD" });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`이미지 저장소 확인 실패 (${res.status})`);
      return true;
    },
    async save(key, bytes, contentType) {
      const res = await send(key, {
        method: "PUT", body: new Uint8Array(bytes),
        headers: { "Content-Type": contentType, "If-None-Match": "*" },
      });
      // 412: someone stored the same content-addressed file first — that is success.
      if (!res.ok && res.status !== 412) throw new Error(`이미지 저장소 저장 실패 (${res.status})`);
    },
    async open(key) {
      const res = await send(key);
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error(`이미지 저장소 조회 실패 (${res.status})`);
      return {
        contentType: res.headers.get("content-type") ?? "image/jpeg",
        body: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      };
    },
  };
}

function replitDriver(): AssetDriver {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("App Storage가 설정되지 않았습니다.");
  const [bucketName, ...prefix] = dir.replace(/^\/+/, "").split("/");
  let bucket: Promise<import("@google-cloud/storage").Bucket> | undefined;
  const getFile = async (key: string) => (await (bucket ??= import("@google-cloud/storage").then(({ Storage }) =>
    new Storage({
      credentials: {
        audience: "replit", subject_token_type: "access_token",
        token_url: "http://127.0.0.1:1106/token", type: "external_account",
        credential_source: { url: "http://127.0.0.1:1106/credential", format: { type: "json", subject_token_field_name: "access_token" } },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    }).bucket(bucketName!)))).file(joinKey(...prefix, key));
  return {
    async exists(key) { const [exists] = await (await getFile(key)).exists(); return exists; },
    async save(key, bytes, contentType) {
      try {
        await (await getFile(key)).save(bytes, { resumable: false, contentType, preconditionOpts: { ifGenerationMatch: 0 } });
      } catch (error) {
        if ((error as { code?: number }).code !== 412) throw error;
      }
    },
    async open(key) {
      const file = await getFile(key);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [metadata] = await file.getMetadata();
      return { contentType: metadata.contentType ?? "image/jpeg", body: file.createReadStream() };
    },
  };
}

let driver: AssetDriver | undefined;
function assets(): AssetDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER
    ?? (process.env.S3_BUCKET ? "s3" : process.env.PRIVATE_OBJECT_DIR ? "replit" : "");
  if (kind === "s3") return driver = s3Driver();
  if (kind === "replit") return driver = replitDriver();
  throw new Error(NOT_CONFIGURED);
}

const assetKey = (roomId: string, name: string) => joinKey("sync", roomId, name);

export function openThumbnail(roomId: string, name: string): Promise<StoredAsset | null> {
  return assets().open(assetKey(roomId, name));
}

export async function persistThumbnails(roomId: string, data: SyncData): Promise<SyncData> {
  const convert = async (item: SyncData["library"][number]) => {
    const url = item.thumbnailUrl;
    if (typeof url !== "string" || !url.startsWith("data:")) return item;
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(url);
    if (!match) throw new Error("지원하지 않는 교재 이미지 형식입니다.");
    const bytes = Buffer.from(match[2]!, "base64");
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("교재 미리보기 이미지가 너무 큽니다.");
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${match[1]}`;
    const store = assets();
    const key = assetKey(roomId, name);
    if (!await store.exists(key)) await store.save(key, bytes, `image/${match[1]}`);
    return { ...item, thumbnailUrl: `/api/sync/assets/${roomId}/${name}` };
  };
  const library: SyncData["library"] = [];
  for (let i = 0; i < data.library.length; i += 6) {
    library.push(...await Promise.all(data.library.slice(i, i + 6).map(convert)));
  }
  return { ...data, library };
}
