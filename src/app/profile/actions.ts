"use server";

import { revalidatePath } from "next/cache";
import { login, loginMessage, setPassword, passwordProblem } from "@/lib/auth/admin.ts";
import { displayNameProblem, setDisplayName } from "@/lib/auth/profile.ts";
import { currentEmail } from "../login/actions.ts";

export interface SaveState {
  error: string | null;
  done: string | null;
}

export const EMPTY: SaveState = { error: null, done: null };

/**
 * The account being changed is ALWAYS the one in the session cookie.
 *
 * Never an email out of the form, even a hidden one. The login page may take
 * an email from a field because it demands the matching password in the same
 * submission; a page you reach by already being signed in has no such check,
 * so a hidden field there is an invitation to edit somebody else's account.
 */
async function me(): Promise<string | null> {
  return currentEmail();
}

/**
 * A thrown error becomes a line on the form, never an error page.
 *
 * `login` and `setPassword` both throw when the database answers with
 * anything but a result, and an uncaught throw in a server action is the full
 * "Application error: a server-side exception has occurred" page with a digest
 * on it. On this screen that is the worst possible outcome: it is the page
 * where somebody is changing their password, and the one thing they need to
 * know is whether it changed. A sentence on the form says so; an error page
 * does not.
 */
function failed(err: unknown, doing: string): SaveState {
  const message = err instanceof Error ? err.message : String(err);
  return { error: `${doing} failed: ${message}`, done: null };
}

export async function saveName(_prev: SaveState, form: FormData): Promise<SaveState> {
  let email: string | null;
  try {
    email = await me();
  } catch (err) {
    return failed(err, "Reading your session");
  }
  if (!email) return { error: "You are not signed in.", done: null };

  const name = String(form.get("name") ?? "");
  const problem = displayNameProblem(name);
  if (problem) return { error: problem, done: null };

  try {
    await setDisplayName(email, name);
  } catch (err) {
    return { error: (err as Error).message, done: null };
  }

  // The header shows the name, so every page is now out of date.
  revalidatePath("/", "layout");
  return {
    error: null,
    done: name.trim() === "" ? "Name cleared. The header shows your email again." : "Name saved.",
  };
}

/**
 * Change your own password, current one required.
 *
 * The current password is demanded even though the session already proves who
 * you are, because a session is not the same claim: a signed-in laptop left
 * open is somebody else's hands on the keyboard, and the one thing they must
 * not be able to do is lock the owner out of the account.
 *
 * `login` is what checks it, which also means a wrong one counts toward the
 * same lockout the sign-in page uses. That is correct rather than convenient,
 * and the message says so when it happens.
 */
export async function changePassword(_prev: SaveState, form: FormData): Promise<SaveState> {
  let email: string | null;
  try {
    email = await me();
  } catch (err) {
    return failed(err, "Reading your session");
  }
  if (!email) return { error: "You are not signed in.", done: null };

  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");

  if (!current) return { error: "Enter your current password.", done: null };

  let check;
  try {
    check = await login(email, current);
  } catch (err) {
    // The check itself failed, which is not the same as the password being
    // wrong, and it must not read as if it were: nothing has been counted
    // against the lockout and nothing has changed.
    return failed(err, "Checking your current password");
  }
  if (!check.ok) return { error: loginMessage(check), done: null };

  if (password !== again) return { error: "Those two do not match.", done: null };
  if (password === current) {
    return { error: "That is the password you already have.", done: null };
  }

  const problem = passwordProblem(password);
  if (problem) return { error: problem, done: null };

  try {
    await setPassword(email, password);
  } catch (err) {
    return { error: (err as Error).message, done: null };
  }

  // `set_admin_password` clears `must_change`, so a profile that was still on
  // a temporary password is no longer flagged once this returns.
  revalidatePath("/profile");
  return { error: null, done: "Password changed." };
}
