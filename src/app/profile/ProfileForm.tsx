"use client";

import { useActionState } from "react";
import { saveName, changePassword, EMPTY, type SaveState } from "./actions.ts";

function Result({ state }: { state: SaveState }) {
  if (state.error) return <p className="hint upload-failed">{state.error}</p>;
  if (state.done) return <p className="hint profile-done">{state.done}</p>;
  return null;
}

export function NameForm({ current }: { current: string }) {
  const [state, action, saving] = useActionState(saveName, EMPTY);
  return (
    <form action={action} className="row">
      <span className="field-label">Display name</span>
      <p className="hint">
        Shown in the header instead of your email. Leave it empty to go back to the
        email.
      </p>
      <input
        id="name"
        name="name"
        type="text"
        className="pub-url"
        defaultValue={current}
        placeholder="e.g. Dave"
        maxLength={60}
        autoComplete="name"
      />
      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save name"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, saving] = useActionState(changePassword, EMPTY);
  return (
    <form action={action} className="row">
      <span className="field-label">Change password</span>
      <p className="hint">
        Your current password is needed even though you are signed in. A session left
        open on a shared screen should not be enough to lock you out of your own
        account.
      </p>

      {/* The email is here, hidden and disabled, for the password manager only:
          without it some managers will not offer to update the saved entry. The
          server ignores it entirely and uses the session. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        hidden
        readOnly
        value=""
        aria-hidden="true"
      />

      <label className="field-sub" htmlFor="current">
        Current password
      </label>
      <input
        id="current"
        name="current"
        type="password"
        className="pub-url"
        autoComplete="current-password"
        required
      />

      <label className="field-sub" htmlFor="password">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className="pub-url"
        autoComplete="new-password"
        minLength={12}
        required
      />
      <p className="hint">At least 12 characters. Length beats punctuation.</p>

      <label className="field-sub" htmlFor="again">
        New password again
      </label>
      <input
        id="again"
        name="again"
        type="password"
        className="pub-url"
        autoComplete="new-password"
        required
      />

      <div className="actions">
        <button className="btn approve" type="submit" disabled={saving}>
          {saving ? "Changing…" : "Change password"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
