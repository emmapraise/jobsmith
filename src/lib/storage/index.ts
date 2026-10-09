import "server-only";
import { env } from "@/lib/env";
import { createLocalStorage } from "./local";
import { createR2Storage } from "./r2";
import type { ObjectStorage } from "./types";

export * from "./types";
export * from "./keys";

let instance: ObjectStorage | undefined;

export function storage(): ObjectStorage {
  if (!instance) instance = env().STORAGE_DRIVER === "r2" ? createR2Storage() : createLocalStorage();
  return instance;
}
