"use client";

import { useState, type FormEvent } from "react";

export function AccountControls({ initialDisplayName }: { initialDisplayName: string }) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/app/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json().catch(() => ({})) as { profile?: { display_name: string }; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Der Anzeigename konnte nicht gespeichert werden.");
      setDisplayName(data.profile.display_name); setMessage("Dein Anzeigename ist gespeichert.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Anzeigename konnte nicht gespeichert werden."); }
    finally { setPending(false); }
  }

  async function requestDeletion() {
    if (!window.confirm("Möchtest du den Löschantrag wirklich stellen? Dein Zugang wird sofort gesperrt.")) return;
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/app/account/deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => ({})) as { deleteAfter?: string; error?: string };
      if (!response.ok || !data.deleteAfter) throw new Error(data.error ?? "Der Löschantrag konnte nicht gestellt werden.");
      setMessage(`Dein Zugang ist gesperrt. Die endgültige Löschung ist für den ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(data.deleteAfter))} vorgemerkt.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Löschantrag konnte nicht gestellt werden."); }
    finally { setPending(false); }
  }

  return <div className="admin-manager">
    <section className="import-panel"><p className="eyebrow">Profil</p><h2>Wie dürfen wir dich nennen?</h2><form className="admin-stack" onSubmit={saveProfile}><label className="admin-field">Anzeigename<input value={displayName} required maxLength={80} disabled={pending} onChange={(event) => setDisplayName(event.target.value)} /></label><div className="admin-form-actions"><button className="primary-button" disabled={pending}>{pending ? "Speichert …" : "Namen speichern"}</button></div></form></section>
    <section className="import-panel"><p className="eyebrow">Deine Daten</p><h2>Export</h2><p>Du kannst deine Kontodaten und Listenmitgliedschaften jederzeit als JSON-Datei herunterladen.</p><a className="secondary-button account-button" href="/api/app/data-export">Daten herunterladen</a></section>
    <section className="import-panel admin-danger-zone"><div><p className="eyebrow">Konto</p><h2>Löschantrag</h2><p>Dein Zugang wird sofort gesperrt. Nach 30 Tagen wird das Konto endgültig gelöscht. Bist du alleiniger Owner einer Liste, übergib diese Rolle zuerst an eine vertraute Person.</p>{(message || error) && <p className={error ? "form-error" : "form-success"} role="status">{error || message}</p>}</div><button className="danger-button" type="button" disabled={pending} onClick={() => void requestDeletion()}>{pending ? "Wird beantragt …" : "Löschantrag stellen"}</button></section>
  </div>;
}
