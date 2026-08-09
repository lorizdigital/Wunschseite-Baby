"use client";

import { useState, type FormEvent } from "react";

export function InvitationAcceptance({ token }: { token: string }) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/app/invitations/accept", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, displayName }),
      });
      const data = await response.json().catch(() => ({})) as { wishlist?: { wishlist_id: string }; error?: string };
      if (!response.ok || !data.wishlist?.wishlist_id) throw new Error(data.error ?? "Die Einladung konnte nicht angenommen werden.");
      window.location.assign(`/app/lists/${data.wishlist.wishlist_id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Einladung konnte nicht angenommen werden."); }
    finally { setPending(false); }
  }

  return <form className="admin-stack" onSubmit={submit}>
    <label className="admin-field" htmlFor="invite-display-name">Wie dürfen wir dich nennen?<input id="invite-display-name" value={displayName} maxLength={80} required onChange={(event) => setDisplayName(event.target.value)} /></label>
    <p className="field-help">Der Name wird nur gebraucht, falls du zum ersten Mal eingeladen wirst.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-actions"><button className="primary-button" disabled={pending}>{pending ? "Wird verbunden …" : "Einladung annehmen"}</button></div>
  </form>;
}
