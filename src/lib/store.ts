import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { newHousehold, type Household } from "./household";

/**
 * Where each household's kitchen lives between conversations.
 * Production: a private Vercel Blob object per household, read fresh on every request so a change
 * made from one device (or one server instance) is what the next request sees.
 * Local and tests: memory plus a JSON file in .data/.
 */
const dir = process.env.LARDER_DATA_DIR || (process.env.VERCEL ? "/tmp/larder" : path.join(process.cwd(), ".data"));
const memory = new Map<string, Household>();
const locks = new Map<string, Promise<unknown>>();

export const HOUSEHOLD_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const DEFAULT_HOUSEHOLD = "demo";
export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
export const storageMode = () => (blobEnabled() ? "blob" : "local");

export function normalizeHousehold(id: string | null | undefined): string {
  const v = (id ?? "").trim().toLowerCase();
  return HOUSEHOLD_RE.test(v) ? v : DEFAULT_HOUSEHOLD;
}

const key = (id: string) => `households/${id}.json`;

async function readRaw(id: string): Promise<Household | null> {
  if (blobEnabled()) {
    try {
      const { get } = await import("@vercel/blob");
      const res = await get(key(id), { access: "private", useCache: false });
      if (res && res.statusCode === 200) return JSON.parse(await new Response(res.stream).text()) as Household;
      return null;
    } catch (err) {
      console.error(`[larder] blob read ${id} failed, using local copy:`, err instanceof Error ? err.message : err);
    }
  }
  if (memory.has(id)) return memory.get(id)!;
  try {
    return JSON.parse(await fs.readFile(path.join(dir, key(id)), "utf8")) as Household;
  } catch {
    return null;
  }
}

async function writeRaw(h: Household) {
  memory.set(h.id, h);
  if (blobEnabled()) {
    try {
      const { put } = await import("@vercel/blob");
      await put(key(h.id), JSON.stringify(h), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return;
    } catch (err) {
      console.error(`[larder] blob write ${h.id} failed, kept locally:`, err instanceof Error ? err.message : err);
    }
  }
  const file = path.join(dir, key(h.id));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(h));
}

export async function loadHousehold(id: string): Promise<Household> {
  return (await readRaw(id)) ?? newHousehold(id);
}

/**
 * Runs one operation against a household with a per-instance lock, and saves only if the
 * operation changed something (reads cost no writes).
 */
export async function withHousehold<T>(id: string, fn: (h: Household) => T | Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const h = await loadHousehold(id);
    const before = JSON.stringify(h);
    const result = await fn(h);
    if (JSON.stringify(h) !== before) await writeRaw(h);
    return result;
  });
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}

export async function resetHousehold(id: string): Promise<Household> {
  const h = newHousehold(id);
  await writeRaw(h);
  return h;
}
