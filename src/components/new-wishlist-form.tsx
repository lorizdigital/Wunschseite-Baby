"use client";

import { useState, type FormEvent } from "react";

export function NewWishlistForm() {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/app/wishlists", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, intro, displayName }),
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
    <label className="admin-field" htmlFor="wishlist-intro">Ein paar persönliche Worte <span>optional</span><textarea id="wishlist-intro" maxLength={2000} rows={5} placeholder="Was möchtet ihr euren Liebsten sagen?" value={intro} onChange={(event) => setIntro(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-actions"><button className="primary-button" disabled={pending}>{pending ? "Legt an …" : "Wunschliste anlegen"}</button></div>
  </form>;
}
