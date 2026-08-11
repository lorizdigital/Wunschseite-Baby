"use client";

import { useState, type FormEvent } from "react";
import { ACCESS_CODE_MAX_LENGTH, ACCESS_CODE_MIN_LENGTH, validateAccessCode } from "@/lib/access-code";
import { SecretInput } from "@/components/secret-input";

export function NewWishlistForm() {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const accessCodeValidation = validateAccessCode(accessCode);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/app/wishlists", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, intro, displayName, accessCode }),
      });
      const data = await response.json().catch(() => ({})) as { list?: { wishlist_id: string }; error?: string };
      if (!response.ok || !data.list?.wishlist_id) throw new Error(data.error ?? "Die Liste konnte nicht angelegt werden.");
      window.location.assign(`/app/lists/${data.list.wishlist_id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht angelegt werden."); }
    finally { setPending(false); }
  }

  return <form className="admin-stack" onSubmit={submit}>
    <label className="admin-field" htmlFor="display-name">Dein Vorname oder Familienname<input id="display-name" required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
    <label className="admin-field" htmlFor="wishlist-title">Titel deiner Wunschliste<input id="wishlist-title" required maxLength={180} placeholder="Zum Beispiel: Unsere kleine Babyzeit" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="admin-field" htmlFor="wishlist-intro"><span className="admin-field-label">Ein paar persönliche Worte <span className="field-optional">optional</span></span><textarea id="wishlist-intro" maxLength={2000} rows={5} placeholder="Was möchtet ihr euren Liebsten sagen?" value={intro} onChange={(event) => setIntro(event.target.value)} /></label>
    <div className="admin-field"><label className="admin-field-label" htmlFor="wishlist-access-code">Zugangscode für Familie und Freunde</label><span id="new-wishlist-access-code-explanation" className="field-explanation"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>Um den Schutz eurer Daten zu gewährleisten, können Personen, denen ihr den Link schickt, nur auf eure Liste zugreifen, wenn sie auch den Code kennen, den ihr hier festlegt.</span><div className="access-code-input-group"><SecretInput id="wishlist-access-code" required minLength={ACCESS_CODE_MIN_LENGTH} maxLength={ACCESS_CODE_MAX_LENGTH} autoComplete="new-password" value={accessCode} aria-describedby="new-wishlist-access-code-explanation new-wishlist-access-code-validation" aria-invalid={accessCode.length > 0 && !accessCodeValidation.valid} onChange={(event) => setAccessCode(event.target.value)} /><p id="new-wishlist-access-code-validation" className={`field-validation field-validation-${accessCodeValidation.kind}`} aria-live="polite">{accessCodeValidation.message}</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-actions"><button className="primary-button" disabled={pending || !accessCodeValidation.valid}>{pending ? "Legt an …" : "Geschützte Wunschliste anlegen"}</button></div>
  </form>;
}
