// T020: sign-in form against the Cognito pool via SRP, typed lockout state rendered from the
// classified error (never a raw 500/blank screen), session persisted across a reload. No
// self-sign-up link anywhere on this page (AC-1).
import { useCallback, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router";
import { classifySignInError, signIn } from "../../auth/signIn.js";
import { saveSession } from "../../auth/session.js";
import styles from "./SignIn.module.css";

export function Component(): ReactElement {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      signIn(username, password)
        .then((session) => {
          saveSession(session);
          navigate("/", { replace: true });
        })
        .catch((cause: unknown) => {
          setError(classifySignInError(cause).message);
        })
        .finally(() => setSubmitting(false));
    },
    [username, password, navigate],
  );

  return (
    <section aria-label="Sign in" data-route="sign-in" className={styles.page}>
      <h1 className={styles.title}>Roofing CRM</h1>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <label className={styles.label} htmlFor="sign-in-username">
          Username
        </label>
        <input
          id="sign-in-username"
          name="username"
          type="text"
          autoComplete="username"
          className={styles.input}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <label className={styles.label} htmlFor="sign-in-password">
          Password
        </label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error !== undefined && (
          <p role="alert" data-sign-in-error="" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {/* No self sign-up link anywhere on this page (AC-1, constitution: no self-service path). */}
    </section>
  );
}
