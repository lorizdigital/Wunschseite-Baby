export function AccessCodeGate({ action, state }: { action: string; state?: string }) {
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
      <input className="text-field" id="access-code" name="accessCode" type="password" required minLength={8} maxLength={64} autoComplete="off" />
      {message && <p className="form-error" role="alert">{message}</p>}
      <button className="primary-button" type="submit">Liste öffnen</button>
    </form>
  </section></main>;
}
