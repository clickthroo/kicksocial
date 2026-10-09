/**
 * Reading and changing your own account.
 *
 * WHOSE ACCOUNT IS NEVER A FORM FIELD. Every function here takes the email
 * from the caller, and every caller takes it from the signed session cookie
 * rather than from the page. A hidden input saying which account to act on is
 * an account takeover with extra steps: the login page can take one because it
 * also demands the password that goes with it, and a page you reach by already
 * being signed in has no such excuse.
 *
 * THE EMAIL IS NOT EDITABLE, AND THAT IS NOT AN OVERSIGHT. It is the primary
 * key of `admin_users` and it is the identity inside the session cookie, so
 * changing it re-keys the row and invalidates the cookie in the same breath.
 * Doing it properly means a verification step to prove the new address is
 * reachable, which needs email this app does not send. Shown and locked, with
 * the reason on the page, beats a field that half works.
 */
import { engine } from "../engine/client.ts";

export interface Profile {
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  mustChange: boolean;
}

export async function loadProfile(email: string): Promise<Profile | null> {
  const { data, error } = await engine()
    .from("admin_users")
    .select("email,display_name,created_at,last_login_at,must_change")
    .eq("email", email)
    .maybeSingle();

  if (error) throw new Error(`Loading your profile failed: ${error.message}`);
  if (!data) return null;

  const row = data as {
    email: string;
    display_name: string | null;
    created_at: string;
    last_login_at: string | null;
    must_change: boolean;
  };
  return {
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    mustChange: row.must_change,
  };
}

/**
 * What a display name has to clear.
 *
 * Deliberately short. It is shown in a header to the handful of people who run
 * this, not published anywhere, so the only real jobs are stopping an empty
 * string being saved as a name and stopping something long enough to break the
 * layout. Control characters are refused because a name with a newline in it
 * renders as a gap nobody can see the cause of.
 */
export function displayNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return null; // Clearing it is allowed: the email is the fallback.
  if (trimmed.length < 2) return "A name needs at least two characters.";
  if (trimmed.length > 60) return "Keep it under 60 characters.";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return "Remove the line break or control character.";
  return null;
}

/**
 * Save a display name, or clear it.
 *
 * A direct update rather than an RPC, unlike the password. The reason the
 * password goes through `set_admin_password` is that the hashing has to happen
 * server side and the plaintext must not become part of a statement; a name is
 * neither hashed nor secret, so an RPC would be ceremony around an update.
 */
export async function setDisplayName(email: string, name: string): Promise<void> {
  const trimmed = name.trim();
  const { error } = await engine()
    .from("admin_users")
    .update({ display_name: trimmed === "" ? null : trimmed })
    .eq("email", email);
  if (error) throw new Error(`Saving your name failed: ${error.message}`);
}

/** What the header shows: the name where there is one, the email otherwise. */
export function profileLabel(profile: Pick<Profile, "email" | "displayName">): string {
  return profile.displayName?.trim() || profile.email;
}
