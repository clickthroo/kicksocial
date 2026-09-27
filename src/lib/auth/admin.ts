/**
 * Checking a password, which happens in the database and not here.
 *
 * `verify_admin` compares the bcrypt hash server-side, so the hash never
 * travels and the password is a bound parameter rather than part of a
 * statement. It also keeps the lockout counter, because a check that returns
 * "no" without remembering how many times it has said no is a guessing
 * machine.
 */
import { engine } from "../engine/client.ts";

export type LoginResult =
  | { ok: true; email: string; name: string | null; mustChange: boolean }
  | { ok: false; reason: "invalid" | "locked" | "disabled"; until?: string };

/** What the user is told. Never which of the two halves was wrong. */
export function loginMessage(result: Extract<LoginResult, { ok: false }>): string {
  switch (result.reason) {
    case "locked":
      return "Too many attempts. This account is locked for 15 minutes.";
    case "disabled":
      return "That account has been turned off.";
    default:
      return "Email or password not recognised.";
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!email.trim() || !password) return { ok: false, reason: "invalid" };

  const { data, error } = await engine().rpc("verify_admin", {
    p_email: email,
    p_password: password,
  });
  if (error) throw new Error(`Sign-in check failed: ${error.message}`);

  const row = data as {
    ok?: boolean;
    email?: string;
    name?: string | null;
    must_change?: boolean;
    reason?: string;
    until?: string;
  } | null;

  if (!row?.ok) {
    const reason = row?.reason;
    return {
      ok: false,
      reason: reason === "locked" || reason === "disabled" ? reason : "invalid",
      until: row?.until,
    };
  }
  return {
    ok: true,
    email: String(row.email),
    name: row.name ?? null,
    mustChange: row.must_change === true,
  };
}

/** Change your own password. The hashing stays on the server too. */
export async function setPassword(email: string, password: string): Promise<void> {
  const { error } = await engine().rpc("set_admin_password", {
    p_email: email,
    p_password: password,
    p_must_change: false,
  });
  if (error) throw new Error(`Changing the password failed: ${error.message}`);
}

/** What a new password has to clear. Length beats character classes. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (/^\s|\s$/.test(password)) return "Remove the space at the start or end.";
  return null;
}
