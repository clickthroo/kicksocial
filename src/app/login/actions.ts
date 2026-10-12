"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { login, loginMessage, setPassword, passwordProblem } from "@/lib/auth/admin.ts";
import { safeNext } from "@/lib/auth/next-path.ts";
import {
  SESSION_COOKIE,
  SESSION_LIFE_MS,
  readSession,
  sessionSecret,
  signSession,
} from "@/lib/auth/session.ts";

export interface FormState {
  error: string | null;
  /** Set when the password was right but has to be replaced before going on. */
  mustChange?: { email: string } | null;
}

async function startSession(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(email, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_LIFE_MS / 1000,
  });
}

/**
 * The sign-in screen answers with a message rather than an error page.
 *
 * `login` throws when the database cannot answer at all, and an uncaught throw
 * in a server action replaces the form with Next's own error page and a
 * digest. On the one screen somebody uses when nothing else works, a sentence
 * saying the check could not run beats a page saying nothing.
 */
function unavailable(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Could not check that just now: ${message}`;
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));

  let result;
  try {
    result = await login(email, password);
  } catch (err) {
    return { error: unavailable(err) };
  }
  if (!result.ok) return { error: loginMessage(result) };
  if (result.mustChange) return { error: null, mustChange: { email: result.email } };

  await startSession(result.email);
  redirect(next);
}

/**
 * The first sign-in, where the temporary password is replaced.
 *
 * The old password is asked for again rather than trusted from the previous
 * step, so a half-finished sign-in left open on a shared screen cannot be
 * turned into an account takeover by whoever sits down next.
 */
export async function choosePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  const next = safeNext(form.get("next"));

  let result;
  try {
    result = await login(email, current);
  } catch (err) {
    return { error: unavailable(err), mustChange: { email } };
  }
  if (!result.ok) return { error: loginMessage(result), mustChange: { email } };
  if (password !== again) return { error: "Those two do not match.", mustChange: { email } };

  const problem = passwordProblem(password);
  if (problem) return { error: problem, mustChange: { email } };

  try {
    await setPassword(result.email, password);
  } catch (err) {
    return { error: unavailable(err), mustChange: { email } };
  }
  await startSession(result.email);
  redirect(next);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Who is signed in, for the header. Null only if the middleware was bypassed. */
export async function currentEmail(): Promise<string | null> {
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
  return session?.email ?? null;
}
