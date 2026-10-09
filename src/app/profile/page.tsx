import { Nav } from "../Nav.tsx";
import { currentEmail } from "../login/actions.ts";
import { loadProfile } from "@/lib/auth/profile.ts";
import { NameForm, PasswordForm } from "./ProfileForm.tsx";

export const dynamic = "force-dynamic";

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ProfilePage() {
  // The middleware already refused anyone without a session, so this is null
  // only if it was bypassed. Said rather than assumed.
  const email = await currentEmail();
  const profile = email ? await loadProfile(email) : null;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Your account</h1>
        <div className="sub">{profile ? profile.email : "Not signed in"}</div>
        <Nav current="/profile" />
      </header>

      {!profile && (
        <div className="banner">
          You are not signed in, or this account no longer exists. Sign in again.
        </div>
      )}

      {profile && (
        <>
          {profile.mustChange && (
            <div className="notice">
              <strong>This account is still on its temporary password.</strong> Change it
              below.
            </div>
          )}

          <article className="card settings">
            <div className="card-head">
              <h2>Your details</h2>
              <p className="desc">
                Signed in as <strong>{profile.email}</strong>. The email cannot be changed
                here: it is the account itself, and moving it would need a way to prove
                the new address is yours, which this tool has no email to do.
              </p>
            </div>

            <NameForm current={profile.displayName ?? ""} />

            <div className="row">
              <span className="field-label">Account</span>
              <p className="hint">
                Created {when(profile.createdAt)} · last signed in {when(profile.lastLoginAt)}
              </p>
            </div>
          </article>

          <article className="card settings">
            <div className="card-head">
              <h2>Password</h2>
              <p className="desc">
                Five wrong attempts locks the account for fifteen minutes, the same as on
                the sign-in page, so take care with the current one.
              </p>
            </div>
            <PasswordForm />
          </article>
        </>
      )}
    </div>
  );
}
