"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {};

export function LoginForm({ nextPath }: { nextPath?: string } = {}) {
  const [state, action, pending] = useActionState(requestMagicLink, initialState);
  return <form action={action} className="login-form">
    {nextPath && <input type="hidden" name="next" value={nextPath} />}
    <label className="field-label" htmlFor="login-email">E-Mail-Adresse</label>
    <input className="text-field" id="login-email" name="email" type="email" autoComplete="email" required maxLength={320} placeholder="name@beispiel.de" />
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.message && <p className="form-success" role="status">{state.message}</p>}
    <button className="primary-button" disabled={pending}>{pending ? "Wird gesendet …" : "Registrieren oder anmelden"}</button>
  </form>;
}
