"use server";

import { revalidatePath } from "next/cache";
import { setDraftStatus } from "@/lib/run-recipe.ts";

export async function approveDraft(id: string): Promise<void> {
  await setDraftStatus(id, "approved");
  revalidatePath("/");
}

export async function rejectDraft(id: string, notes?: string): Promise<void> {
  await setDraftStatus(id, "rejected", notes);
  revalidatePath("/");
}
