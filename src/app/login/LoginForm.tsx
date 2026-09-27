"use client";

import { useActionState } from "react";
import { signIn, choosePassword, type FormState } from "./actions.ts";

const EMPTY: FormState = { error: null, mustChange: null };

export function LoginForm({ next }: { next: string }) {
  const [signInState, doSignIn, signingIn] = useActionState(signIn, EMPTY);
  const [changeState, doChange, changing] = useActionState(choosePassword, EMPTY);

  // The second step replaces the first once a temporary password has been
  // accepted. Same page, so a refresh does not lose the thread.
  const pending = signInState.mustChange ?? changeState.mustChange;

  if (pending) {
    return (
      <form action={doChange} className="login-form">
        <h2>Choose a password</h2>
        <p className="login-note">
          This account is still on the temporary password it was set up with.
          Pick your own before going on.
        </p>
        <input type="hidden" name="email" value={pending.email} />
        <input type="hidden" name="next" value={next} />

        <label htmlFor="current">Temporary password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required />

        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <div className="login-hint">At least 12 characters.</div>

        <label htmlFor="again">New password again</label>
        <input id="again" name="again" type="password" autoComplete="new-password" required />

        {changeState.error && <div className="login-error">{changeState.error}</div>}
        <button className="btn" type="submit" disabled={changing}>
          {changing ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    );
  }

  return (
    <form action={doSignIn} className="login-form">
      <h2>Sign in</h2>
      <input type="hidden" name="next" value={next} />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required autoFocus />

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />

      {signInState.error && <div className="login-error">{signInState.error}</div>}
      <button className="btn" type="submit" disabled={signingIn}>
        {signingIn ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
