"use server";

import { revalidatePath } from "next/cache";
import { recordPublish, unrecordPublish } from "@/lib/publish.ts";
import type { Platform } from "@/lib/engine/types.ts";

export async function markPosted(
  draftId: string,
  platform: Platform,
  url?: string,
): Promise<void> {
  await recordPublish(draftId, platform, url);
  revalidatePath("/publish");
  revalidatePath("/");
}

export async function unmarkPosted(draftId: string, platform: Platform): Promise<void> {
  await unrecordPublish(draftId, platform);
  revalidatePath("/publish");
  revalidatePath("/");
}
