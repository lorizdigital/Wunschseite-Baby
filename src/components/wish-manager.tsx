"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useState } from "react";
import type { AdminWish, WishDraft } from "@/lib/admin-types";

type ProductPreview = {
  title: string;
  description: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
  shop: string;
  sourceUrl: string;
};

const emptyDraft: WishDraft = { title: "", description: "", productUrl: "", imageUrl: null, priceAmount: null, currency: "EUR", shopName: "" };

function formatPrice(value: number | null, currency = "EUR") {
  return value === null ? "Preis offen" : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

function DraftFields({ value, onChange }: { value: WishDraft; onChange: (draft: WishDraft) => void }) {
  const set = <K extends keyof WishDraft>(key: K, next: WishDraft[K]) => onChange({ ...value, [key]: next });
  return <div className="admin-field-grid">
    <label className="admin-field admin-field-wide"><span>Titel</span><input required maxLength={180} value={value.title} onChange={(event) => set("title", event.target.value)} /></label>
    <label className="admin-field"><span>Anbieter</span><input required maxLength={100} value={value.shopName} onChange={(event) => set("shopName", event.target.value)} /></label>
    <label className="admin-field"><span>Preis</span><input type="number" min="0" max="999999" step="0.01" value={value.priceAmount ?? ""} onChange={(event) => set("priceAmount", event.target.value === "" ? null : Number(event.target.value))} /></label>
    <label className="admin-field"><span>Währung</span><input required maxLength={3} value={value.currency} onChange={(event) => set("currency", event.target.value.toUpperCase())} /></label>
    <label className="admin-field admin-field-wide"><span>Produktlink</span><input required type="url" value={value.productUrl} onChange={(event) => set("productUrl", event.target.value)} /></label>
    <label className="admin-field admin-field-wide"><span>Bildadresse</span><input type="text" value={value.imageUrl ?? ""} onChange={(event) => set("imageUrl", event.target.value || null)} /></label>
    <label className="admin-field admin-field-wide"><span>Beschreibung</span><textarea maxLength={600} rows={3} value={value.description} onChange={(event) => set("description", event.target.value)} /></label>
  </div>;
}

export function WishManager() {
  const [secret, setSecret] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [wishes, setWishes] = useState<AdminWish[]>([]);
  const [productUrl, setProductUrl] = useState("");
  const [newDraft, setNewDraft] = useState<WishDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WishDraft>(emptyDraft);
  const [orderDirty, setOrderDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const active = useMemo(() => wishes.filter((wish) => !wish.archived), [wishes]);
  const archived = useMemo(() => wishes.filter((wish) => wish.archived), [wishes]);

  async function adminRequest(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "x-admin-secret": secret, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const payload = await response.json() as { wishes?: AdminWish[]; error?: string; [key: string]: unknown };
    if (!response.ok) throw new Error(payload.error ?? "Die Anfrage ist fehlgeschlagen.");
    return payload;
  }

  async function loadWishes(event?: FormEvent, keepMessage = false) {
    event?.preventDefault(); setPending(true); setError(""); if (!keepMessage) setMessage("");
    try {
      const payload = await adminRequest("/api/admin/wishes");
      setWishes(payload.wishes ?? []); setAuthorized(true); setOrderDirty(false);
    } catch (reason) { setAuthorized(false); setError(reason instanceof Error ? reason.message : "Der Zugang konnte nicht geöffnet werden."); }
    finally { setPending(false); }
  }

  async function inspectProduct(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setMessage(""); setNewDraft(null);
    try {
      const payload = await adminRequest("/api/import/product", { method: "POST", body: JSON.stringify({ url: productUrl }) }) as { product?: ProductPreview; error?: string };
      if (!payload.product) throw new Error(payload.error ?? "Der Link konnte nicht gelesen werden.");
      const product = payload.product;
      setNewDraft({ title: product.title, description: product.description, imageUrl: product.imageUrl, priceAmount: product.price === null ? null : Number(product.price.replace(",", ".")), currency: product.currency ?? "EUR", shopName: product.shop, productUrl: product.sourceUrl });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Link konnte nicht gelesen werden."); }
    finally { setPending(false); }
  }

  async function createWish(event: FormEvent) {
    event.preventDefault(); if (!newDraft) return; setPending(true); setError("");
    try {
      await adminRequest("/api/admin/wishes", { method: "POST", body: JSON.stringify(newDraft) });
      setNewDraft(null); setProductUrl(""); setMessage("Der Wunsch wurde hinzugefügt und das Produktbild dauerhaft gespeichert."); await loadWishes(undefined, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht gespeichert werden."); }
    finally { setPending(false); }
  }

  function startEdit(wish: AdminWish) {
    setEditingId(wish.id); setError(""); setMessage("");
    setEditDraft({ title: wish.title, description: wish.description, productUrl: wish.productUrl, imageUrl: wish.imageUrl, priceAmount: wish.priceAmount, currency: wish.currency, shopName: wish.shopName });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editingId) return; setPending(true); setError("");
    try {
      await adminRequest(`/api/admin/wishes/${editingId}`, { method: "PATCH", body: JSON.stringify(editDraft) });
      setEditingId(null); setMessage("Die Änderungen wurden gespeichert."); await loadWishes(undefined, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Änderungen konnten nicht gespeichert werden."); }
    finally { setPending(false); }
  }

  function move(id: string, direction: -1 | 1) {
    const ids = active.map((wish) => wish.id);
    const index = ids.indexOf(id); const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const byId = new Map(wishes.map((wish) => [wish.id, wish]));
    setWishes([...ids.map((wishId, position) => ({ ...byId.get(wishId)!, sortOrder: (position + 1) * 10 })), ...archived]);
    setOrderDirty(true);
  }

  async function saveOrder() {
    setPending(true); setError("");
    try { await adminRequest("/api/admin/wishes", { method: "PUT", body: JSON.stringify({ orderedIds: active.map((wish) => wish.id) }) }); setOrderDirty(false); setMessage("Die Reihenfolge wurde gespeichert."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Die Reihenfolge konnte nicht gespeichert werden."); }
    finally { setPending(false); }
  }

  async function setArchived(wish: AdminWish, archivedValue: boolean) {
    if (archivedValue && !window.confirm(`„${wish.title}“ wirklich archivieren?`)) return;
    setPending(true); setError("");
    try { await adminRequest(`/api/admin/wishes/${wish.id}`, { method: "PATCH", body: JSON.stringify({ archived: archivedValue }) }); setMessage(archivedValue ? "Der Wunsch wurde archiviert." : "Der Wunsch wurde wiederhergestellt."); await loadWishes(undefined, true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht geändert werden."); }
    finally { setPending(false); }
  }

  if (!authorized) return <section className="import-panel admin-access-panel">
    <p className="eyebrow">Gemeinsamer Zugang</p><h2>Verwaltung öffnen</h2><p>Ihr benötigt keine Benutzerkonten. Gebt hier euren gemeinsamen Admin-Code ein.</p>
    <form className="import-form" onSubmit={loadWishes}><input aria-label="Admin-Code" type="password" autoComplete="current-password" required value={secret} onChange={(event) => setSecret(event.target.value)} /><button className="primary-button" disabled={pending}>{pending ? "Wird geprüft …" : "Öffnen"}</button></form>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;

  return <div className="admin-manager">
    <div className="admin-session-bar"><span>✓ Verwaltung geöffnet</span><button className="text-button" onClick={() => { setAuthorized(false); setSecret(""); setWishes([]); }}>Zugang schließen</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}

    <section className="import-panel"><p className="eyebrow">Neuer Wunsch</p><h2>Produktlink hinzufügen</h2><p>Der Shoplink wird ausgelesen. Alle Angaben können vor dem Speichern angepasst werden.</p>
      <form className="import-form" onSubmit={inspectProduct}><input aria-label="Produktlink" type="url" required placeholder="https://shop.de/produkt/..." value={productUrl} onChange={(event) => setProductUrl(event.target.value)} /><button className="primary-button" disabled={pending}>{pending ? "Wird ausgelesen …" : "Link prüfen"}</button></form>
      <button className="inline-button manual-entry-button" type="button" onClick={() => { setError(""); setNewDraft({ ...emptyDraft, productUrl }); }}>Angaben stattdessen manuell eintragen</button>
      {newDraft && <form className="admin-product-draft" onSubmit={createWish}><div className="import-image">{newDraft.imageUrl ? <img src={newDraft.imageUrl} alt="Produktvorschau" referrerPolicy="no-referrer" /> : <span>Kein Bild erkannt</span>}</div><div><DraftFields value={newDraft} onChange={setNewDraft}/><div className="admin-form-actions"><button className="primary-button" disabled={pending}>Wunsch speichern</button><button className="secondary-button" type="button" onClick={() => setNewDraft(null)}>Verwerfen</button></div></div></form>}
    </section>

    <section className="import-panel admin-wish-list"><div className="admin-section-head"><div><p className="eyebrow">Öffentliche Liste</p><h2>{active.length} aktive Wünsche</h2></div><button className="primary-button" disabled={!orderDirty || pending} onClick={saveOrder}>Reihenfolge speichern</button></div>
      <div className="admin-items">{active.map((wish, index) => <article className="admin-item" key={wish.id}><div className="admin-item-image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span>–</span>}</div><div className="admin-item-copy"><strong>{wish.title}</strong><small>{wish.shopName} · {formatPrice(wish.priceAmount, wish.currency)}{wish.reserved ? " · Reserviert" : ""}</small></div><div className="admin-item-order"><button aria-label={`${wish.title} nach oben`} disabled={index === 0 || pending} onClick={() => move(wish.id, -1)}>↑</button><button aria-label={`${wish.title} nach unten`} disabled={index === active.length - 1 || pending} onClick={() => move(wish.id, 1)}>↓</button></div><div className="admin-item-actions"><button className="inline-button" onClick={() => startEdit(wish)}>Bearbeiten</button><button className="inline-button danger-text" disabled={wish.reserved || pending} title={wish.reserved ? "Reservierte Wünsche können nicht archiviert werden" : ""} onClick={() => setArchived(wish, true)}>Archivieren</button></div>{editingId === wish.id && <form className="admin-edit-form" onSubmit={saveEdit}><DraftFields value={editDraft} onChange={setEditDraft}/><div className="admin-form-actions"><button className="primary-button" disabled={pending}>Änderungen speichern</button><button className="secondary-button" type="button" onClick={() => setEditingId(null)}>Abbrechen</button></div></form>}</article>)}</div>
    </section>

    {archived.length > 0 && <section className="import-panel admin-wish-list"><p className="eyebrow">Nicht öffentlich</p><h2>Archivierte Wünsche</h2><div className="admin-items">{archived.map((wish) => <article className="admin-item" key={wish.id}><div className="admin-item-image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span>–</span>}</div><div className="admin-item-copy"><strong>{wish.title}</strong><small>{wish.shopName}</small></div><button className="secondary-button" disabled={pending} onClick={() => setArchived(wish, false)}>Wiederherstellen</button></article>)}</div></section>}
  </div>;
}
