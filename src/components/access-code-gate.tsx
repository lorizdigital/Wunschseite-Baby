"use client";

import { useState } from "react";

function EyeIcon({ visible }: { visible: boolean }) {
  return visible
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.2 0 8.8 5.1 9.7 7.1a1.8 1.8 0 0 1 0 1.7 15.5 15.5 0 0 1-3.1 4.1M6.2 6.2A15.3 15.3 0 0 0 2.3 11a1.8 1.8 0 0 0 0 1.7C3.2 14.9 6.8 20 12 20a10.8 10.8 0 0 0 3.1-.5" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.3 12a1.8 1.8 0 0 1 0-1.7C3.2 8.1 6.8 3 12 3s8.8 5.1 9.7 7.3a1.8 1.8 0 0 1 0 1.7C20.8 20 17.2 21 12 21S3.2 15.9 2.3 13.7a1.8 1.8 0 0 1 0-1.7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function AccessCodeGate({ action, state }: { action: string; state?: string }) {
  const [codeVisible, setCodeVisible] = useState(false);
  const message = state === "rate"
    ? "Bitte warte einen Moment, bevor du es erneut versuchst."
    : state === "invalid"
      ? "Der Zugangscode ist nicht richtig."
      : null;

  return <main className="access-code-page"><section className="access-code-card">
    <p className="eyebrow">Private Wunschliste</p>
    <h1>Diese Liste ist geschützt.</h1>
    <p>Bitte frage die Eltern nach dem Zugangscode. Link und Code werden am besten getrennt geteilt.</p>
    <form className="login-form" action={action} method="post">
      <label className="field-label" htmlFor="access-code">Zugangscode</label>
      <div className="secret-input">
        <input className="text-field" id="access-code" name="accessCode" type={codeVisible ? "text" : "password"} required minLength={8} maxLength={64} autoComplete="off" />
        <button className="secret-visibility-button" type="button" onClick={() => setCodeVisible((visible) => !visible)} aria-label={codeVisible ? "Zugangscode verbergen" : "Zugangscode anzeigen"} aria-pressed={codeVisible}>
          <EyeIcon visible={codeVisible} />
        </button>
      </div>
      {message && <p className="form-error" role="alert">{message}</p>}
      <button className="primary-button" type="submit">Liste öffnen</button>
    </form>
  </section></main>;
}
