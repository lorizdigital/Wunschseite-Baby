"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppWishlist, AppWishlistMember, AppWish } from "@/lib/app-wishlist-data";

type Invitation = {
  id: string;
  email_normalized: string | null;
  role: "owner" | "editor" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type WishDraft = {
  title: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  priceAmount: string;
  currency: string;
  shopName: string;
};

const emptyWish: WishDraft = {
  title: "", description: "", productUrl: "", imageUrl: "", priceAmount: "", currency: "EUR", shopName: "",
};

function toDraft(wish: AppWish): WishDraft {
  return {
    title: wish.title,
    description: wish.description,
    productUrl: wish.productUrl ?? "",
    imageUrl: wish.imageUrl ?? "",
    priceAmount: wish.priceAmount === null ? "" : String(wish.priceAmount),
    currency: wish.currency,
    shopName: wish.shopName,
  };
}

function toPayload(draft: WishDraft) {
  return {
    title: draft.title,
    description: draft.description,
    productUrl: draft.productUrl,
    imageUrl: draft.imageUrl,
    priceAmount: draft.priceAmount.trim() === "" ? null : Number(draft.priceAmount),
    currency: draft.currency,
    shopName: draft.shopName,
  };
}

async function requestJson<T>(url: string, method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Das Speichern ist gerade nicht möglich.");
  return data;
}

function WishFields({ draft, onChange, idPrefix }: { draft: WishDraft; onChange: (next: WishDraft) => void; idPrefix: string }) {
  const update = (field: keyof WishDraft, value: string) => onChange({ ...draft, [field]: value });
  return <div className="admin-field-grid">
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-title`}>Wunsch<input id={`${idPrefix}-title`} value={draft.title} maxLength={180} required onChange={(event) => update("title", event.target.value)} /></label>
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-description`}>Beschreibung <span>optional</span><textarea id={`${idPrefix}-description`} value={draft.description} maxLength={600} rows={3} onChange={(event) => update("description", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-shop`}>Shop <span>optional</span><input id={`${idPrefix}-shop`} value={draft.shopName} maxLength={100} onChange={(event) => update("shopName", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-price`}>Preis <span>optional</span><input id={`${idPrefix}-price`} type="number" min="0" max="999999" step="0.01" inputMode="decimal" value={draft.priceAmount} onChange={(event) => update("priceAmount", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-currency`}>Währung<input id={`${idPrefix}-currency`} value={draft.currency} maxLength={3} pattern="[A-Za-z]{3}" onChange={(event) => update("currency", event.target.value.toUpperCase())} /></label>
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-product`}>Produktlink <span>optional</span><input id={`${idPrefix}-product`} type="url" value={draft.productUrl} maxLength={2048} placeholder="https://…" onChange={(event) => update("productUrl", event.target.value)} /></label>
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-image`}>Bildlink <span>optional</span><input id={`${idPrefix}-image`} type="url" value={draft.imageUrl} maxLength={2048} placeholder="https://…" onChange={(event) => update("imageUrl", event.target.value)} /></label>
  </div>;
}

function formatPrice(wish: AppWish) {
  if (wish.priceAmount === null) return "Preis offen";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: wish.currency || "EUR" }).format(wish.priceAmount);
}

function WishThumbnail({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return <div className="admin-item-image">♡</div>;
  // Remote shop images intentionally are not passed to Next's image optimizer:
  // the optimizer would need a broad, unsafe remote-host allowlist.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="admin-item-image"><img src={imageUrl} alt="" /></div>;
}

export function WishlistManager({
  initialWishlist,
  initialWishes,
  initialMembers,
  currentUserId,
  publicationEnabled,
  productImportEnabled,
  appOrigin,
}: {
  initialWishlist: AppWishlist;
  initialWishes: AppWish[];
  initialMembers: AppWishlistMember[];
  currentUserId: string;
  publicationEnabled: boolean;
  productImportEnabled: boolean;
  appOrigin: string;
}) {
  const [wishlist, setWishlist] = useState(initialWishlist);
  const [wishes, setWishes] = useState(initialWishes);
  const [members, setMembers] = useState(initialMembers);
  const [title, setTitle] = useState(initialWishlist.title);
  const [intro, setIntro] = useState(initialWishlist.intro);
  const [newWish, setNewWish] = useState<WishDraft>(emptyWish);
  const [importUrl, setImportUrl] = useState("");
  const [editingWish, setEditingWish] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WishDraft>(emptyWish);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [coOwnerEmail, setCoOwnerEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [oneTimeInviteUrl, setOneTimeInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const isOwner = wishlist.role === "owner";
  const isArchived = Boolean(wishlist.archivedAt);
  const activeWishes = useMemo(() => wishes.filter((wish) => !wish.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder), [wishes]);
  const archivedWishes = useMemo(() => wishes.filter((wish) => wish.archivedAt), [wishes]);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    fetch(`/api/app/wishlists/${wishlist.id}/invitations`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { invitations: Invitation[] }) => active && setInvitations(data.invitations))
      .catch(() => active && setError("Einladungen konnten gerade nicht geladen werden."));
    return () => { active = false; };
  }, [isOwner, wishlist.id]);

  function start(label: string) { setPending(label); setError(""); setMessage(""); }
  function finish() { setPending(null); }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("details");
    try {
      const data = await requestJson<{ wishlist: { title: string; intro: string } }>(`/api/app/wishlists/${wishlist.id}`, "PATCH", { title, intro });
      setWishlist((current) => ({ ...current, title: data.wishlist.title, intro: data.wishlist.intro }));
      setMessage("Die Listentexte sind gespeichert.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht gespeichert werden."); }
    finally { finish(); }
  }

  async function addWish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("new-wish");
    try {
      const data = await requestJson<{ wish: { wish_id: string; sort_order: number } }>(`/api/app/wishlists/${wishlist.id}/wishes`, "POST", toPayload(newWish));
      setWishes((current) => [...current, {
        id: data.wish.wish_id, title: newWish.title.trim(), description: newWish.description.trim(), productUrl: newWish.productUrl.trim() || null,
        imageUrl: newWish.imageUrl.trim() || null, priceAmount: newWish.priceAmount.trim() === "" ? null : Number(newWish.priceAmount),
        currency: newWish.currency.trim().toUpperCase(), shopName: newWish.shopName.trim() || "Wunsch", sortOrder: data.wish.sort_order, archivedAt: null,
      }]);
      setNewWish(emptyWish); setMessage("Der Wunsch ist angelegt.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht angelegt werden."); }
    finally { finish(); }
  }

  async function importWish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("import-wish");
    try {
      const data = await requestJson<{ wish: AppWish }>(`/api/app/wishlists/${wishlist.id}/product-import`, "POST", { url: importUrl });
      setWishes((current) => [...current, data.wish]); setImportUrl(""); setMessage("Der Produktwunsch wurde angelegt. Du kannst ihn unten noch anpassen.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Produktlink konnte nicht importiert werden."); }
    finally { finish(); }
  }

  async function saveWish(wishId: string) {
    start(`wish-${wishId}`);
    try {
      await requestJson(`/api/app/wishlists/${wishlist.id}/wishes/${wishId}`, "PATCH", toPayload(editDraft));
      setWishes((current) => current.map((wish) => wish.id !== wishId ? wish : {
        ...wish, title: editDraft.title.trim(), description: editDraft.description.trim(), productUrl: editDraft.productUrl.trim() || null,
        imageUrl: editDraft.imageUrl.trim() || null, priceAmount: editDraft.priceAmount.trim() === "" ? null : Number(editDraft.priceAmount),
        currency: editDraft.currency.trim().toUpperCase(), shopName: editDraft.shopName.trim() || "Wunsch",
      }));
      setEditingWish(null); setMessage("Der Wunsch ist gespeichert.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht gespeichert werden."); }
    finally { finish(); }
  }

  async function archiveWish(wish: AppWish, archived: boolean) {
    start(`archive-${wish.id}`);
    try {
      await requestJson(`/api/app/wishlists/${wishlist.id}/wishes/${wish.id}`, "POST", { archived });
      setWishes((current) => current.map((item) => item.id === wish.id ? { ...item, archivedAt: archived ? new Date().toISOString() : null } : item));
      setMessage(archived ? "Der Wunsch ist archiviert." : "Der Wunsch ist wieder aktiv.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht geändert werden."); }
    finally { finish(); }
  }

  async function moveWish(wishId: string, direction: -1 | 1) {
    const currentIndex = activeWishes.findIndex((wish) => wish.id === wishId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeWishes.length) return;
    const ordered = [...activeWishes];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    start(`order-${wishId}`);
    try {
      await requestJson(`/api/app/wishlists/${wishlist.id}/wishes/order`, "POST", { wishIds: ordered.map((wish) => wish.id) });
      setWishes((current) => current.map((wish) => {
        const sortIndex = ordered.findIndex((item) => item.id === wish.id);
        return sortIndex < 0 ? wish : { ...wish, sortOrder: (sortIndex + 1) * 10 };
      }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Reihenfolge konnte nicht gespeichert werden."); }
    finally { finish(); }
  }

  async function publish() {
    start("publish");
    try {
      const data = await requestJson<{ publishedAt: string }>(`/api/app/wishlists/${wishlist.id}/publish`, "POST", {});
      setWishlist((current) => ({ ...current, publishedAt: data.publishedAt }));
      setMessage("Die Liste ist jetzt für Menschen mit dem Link sichtbar.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht veröffentlicht werden."); }
    finally { finish(); }
  }

  async function rotateLink() {
    if (!window.confirm("Der bisherige Link funktioniert danach nicht mehr. Wirklich erneuern?")) return;
    start("share-link");
    try {
      const data = await requestJson<{ publicSlug: string }>(`/api/app/wishlists/${wishlist.id}/share-link`, "POST", {});
      setWishlist((current) => ({ ...current, publicSlug: data.publicSlug }));
      setMessage("Der Freigabelink wurde erneuert.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Link konnte nicht erneuert werden."); }
    finally { finish(); }
  }

  async function archiveList() {
    if (!window.confirm("Die Liste wird sofort nicht mehr öffentlich angezeigt. Wirklich archivieren?")) return;
    start("archive-list");
    try {
      const data = await requestJson<{ archivedAt: string }>(`/api/app/wishlists/${wishlist.id}/archive`, "POST", {});
      setWishlist((current) => ({ ...current, archivedAt: data.archivedAt }));
      setMessage("Die Liste ist archiviert und nicht mehr öffentlich sichtbar.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht archiviert werden."); }
    finally { finish(); }
  }

  async function scheduleDeletion() {
    if (!window.confirm("Die Liste wird sofort geschlossen und nach 90 Tagen mitsamt ihren Wünschen gelöscht. Wirklich vormerken?")) return;
    start("delete-list");
    try {
      const data = await requestJson<{ deleteAfter: string }>(`/api/app/wishlists/${wishlist.id}/deletion`, "POST", {});
      setWishlist((current) => ({ ...current, archivedAt: current.archivedAt ?? new Date().toISOString(), deleteAfter: data.deleteAfter }));
      setMessage(`Die Liste ist geschlossen und für den ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(data.deleteAfter))} zur Löschung vorgemerkt.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Löschung konnte nicht vorgemerkt werden."); }
    finally { finish(); }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("invite");
    try {
      const data = await requestJson<{ invitation: Invitation; acceptUrl: string }>(`/api/app/wishlists/${wishlist.id}/invitations`, "POST", { email: inviteEmail, role: inviteRole });
      setInvitations((current) => [data.invitation, ...current]); setInviteEmail(""); setOneTimeInviteUrl(data.acceptUrl);
      setMessage("Die Einladung ist erstellt. Teile den Link jetzt sicher mit dieser Person.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Einladung konnte nicht erstellt werden."); }
    finally { finish(); }
  }

  async function createCoOwnerInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("invite-co-owner");
    try {
      const data = await requestJson<{ invitation: Invitation; acceptUrl: string }>(`/api/app/wishlists/${wishlist.id}/invitations`, "POST", { email: coOwnerEmail, role: "owner" });
      setInvitations((current) => [data.invitation, ...current]); setCoOwnerEmail(""); setOneTimeInviteUrl(data.acceptUrl);
      setMessage("Die gleichberechtigte Owner-Einladung ist erstellt. Teile den Link jetzt sicher.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Owner-Einladung konnte nicht erstellt werden."); }
    finally { finish(); }
  }

  async function revokeInvitation(invitationId: string) {
    start(`invite-${invitationId}`);
    try {
      await requestJson(`/api/app/wishlists/${wishlist.id}/invitations/${invitationId}`, "DELETE", {});
      setInvitations((current) => current.map((invite) => invite.id === invitationId ? { ...invite, revoked_at: new Date().toISOString() } : invite));
      setMessage("Die Einladung wurde widerrufen.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Einladung konnte nicht widerrufen werden."); }
    finally { finish(); }
  }

  async function changeMemberRole(memberId: string, role: AppWishlistMember["role"]) {
    start(`member-${memberId}`);
    try {
      const data = await requestJson<{ role: AppWishlistMember["role"] }>(`/api/app/wishlists/${wishlist.id}/members/${memberId}`, "PATCH", { role });
      setMembers((current) => current.map((member) => member.userId === memberId ? { ...member, role: data.role } : member));
      setMessage("Die Rolle wurde aktualisiert.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Rolle konnte nicht geändert werden."); }
    finally { finish(); }
  }

  async function removeMember(member: AppWishlistMember) {
    if (!window.confirm(`${member.displayName} wirklich von dieser Liste entfernen?`)) return;
    start(`member-${member.userId}`);
    try {
      await requestJson(`/api/app/wishlists/${wishlist.id}/members/${member.userId}`, "DELETE", {});
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setMessage(`${member.displayName} hat keinen Zugriff mehr.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Das Mitglied konnte nicht entfernt werden."); }
    finally { finish(); }
  }

  const shareUrl = wishlist.publicSlug ? `${appOrigin}/w/${wishlist.publicSlug}` : "";

  return <div className="admin-manager">
    {(message || error) && <p className={error ? "form-error" : "form-success"} role="status">{error || message}</p>}

    {isOwner && <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Liste</p><h2>Deine Worte</h2></div></div><form onSubmit={saveDetails} className="admin-stack"><label className="admin-field">Titel<input value={title} maxLength={180} required disabled={isArchived || pending !== null} onChange={(event) => setTitle(event.target.value)} /></label><label className="admin-field">Einleitung <span>optional</span><textarea value={intro} maxLength={2000} rows={4} disabled={isArchived || pending !== null} onChange={(event) => setIntro(event.target.value)} /></label><div className="admin-form-actions"><button className="primary-button" disabled={isArchived || pending !== null}>{pending === "details" ? "Speichert …" : "Texte speichern"}</button></div></form></section>}

    {isOwner && <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Freigabe</p><h2>Mit Familie teilen</h2></div></div><p>{wishlist.publishedAt && wishlist.publicSlug ? "Deine Liste ist veröffentlicht. Nur Personen mit diesem Link können sie öffnen." : publicationEnabled ? "Prüfe den Auftritt zuerst in der privaten Vorschau. Danach kannst du die Liste mit ihrem persönlichen Link veröffentlichen." : "Die Veröffentlichung ist für diese geschlossene Beta noch nicht freigeschaltet."}</p><div className="admin-form-actions"><a className="secondary-button" href={`/app/lists/${wishlist.id}/preview`} target="_blank" rel="noreferrer">Private Vorschau öffnen</a></div>{wishlist.publishedAt && wishlist.publicSlug && <><div className="share-link-row"><input readOnly value={shareUrl} aria-label="Freigabelink" /><a className="secondary-button" href={`/w/${wishlist.publicSlug}`} target="_blank" rel="noreferrer">Öffnen</a></div><div className="admin-form-actions"><button className="secondary-button" type="button" onClick={() => void rotateLink()} disabled={isArchived || pending !== null}>{pending === "share-link" ? "Erneuert …" : "Link erneuern"}</button></div></>}{publicationEnabled && !wishlist.publishedAt && <div className="admin-form-actions"><button className="primary-button" type="button" disabled={isArchived || pending !== null || activeWishes.length === 0} onClick={() => void publish()}>{pending === "publish" ? "Veröffentlicht …" : "Jetzt veröffentlichen"}</button></div>}{isArchived && <p className="form-error">Diese Liste ist archiviert und kann nicht weiter bearbeitet werden.</p>}</section>}

    {!isArchived && wishlist.role !== "viewer" && <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Wünsche</p><h2>Etwas Schönes hinzufügen</h2></div></div>{productImportEnabled && <form className="import-form" onSubmit={importWish}><input type="url" required value={importUrl} maxLength={16384} placeholder="Produktlink einfügen" disabled={pending !== null} onChange={(event) => setImportUrl(event.target.value)} /><button className="secondary-button" disabled={pending !== null}>{pending === "import-wish" ? "Liest ein …" : "Link einlesen"}</button></form>}<form className="admin-stack" onSubmit={addWish}><WishFields draft={newWish} onChange={setNewWish} idPrefix="new-wish" /><div className="admin-form-actions"><button className="primary-button" disabled={pending !== null}>{pending === "new-wish" ? "Legt an …" : "Wunsch hinzufügen"}</button></div></form></section>}

    <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Wunschliste</p><h2>{activeWishes.length} aktive {activeWishes.length === 1 ? "Idee" : "Ideen"}</h2></div></div>{activeWishes.length ? <div className="admin-items">{activeWishes.map((wish, index) => <article className="admin-item" key={wish.id}><WishThumbnail imageUrl={wish.imageUrl} /><div className="admin-item-copy"><strong>{wish.title}</strong><small>{wish.shopName} · {formatPrice(wish)}</small>{wish.description && <small>{wish.description}</small>}</div>{wishlist.role !== "viewer" && !isArchived && <div className="admin-item-order"><button aria-label={`${wish.title} nach oben`} disabled={index === 0 || pending !== null} onClick={() => void moveWish(wish.id, -1)}>↑</button><button aria-label={`${wish.title} nach unten`} disabled={index === activeWishes.length - 1 || pending !== null} onClick={() => void moveWish(wish.id, 1)}>↓</button></div>}{wishlist.role !== "viewer" && !isArchived && <div className="admin-item-actions"><button className="inline-button" type="button" disabled={pending !== null} onClick={() => { setEditingWish(wish.id); setEditDraft(toDraft(wish)); }}>Bearbeiten</button><button className="inline-button danger-text" type="button" disabled={pending !== null} onClick={() => void archiveWish(wish, true)}>Archivieren</button></div>}{editingWish === wish.id && <form className="admin-edit-form" onSubmit={(event) => { event.preventDefault(); void saveWish(wish.id); }}><WishFields draft={editDraft} onChange={setEditDraft} idPrefix={`wish-${wish.id}`} /><div className="admin-form-actions"><button className="primary-button" disabled={pending !== null}>{pending === `wish-${wish.id}` ? "Speichert …" : "Speichern"}</button><button className="secondary-button" type="button" onClick={() => setEditingWish(null)} disabled={pending !== null}>Abbrechen</button></div></form>}</article>)}</div> : <p>Hier warten noch keine Wünsche auf euch.</p>}{archivedWishes.length > 0 && <div className="admin-archived"><h3>Archivierte Wünsche</h3>{archivedWishes.map((wish) => <div className="admin-archived-row" key={wish.id}><span>{wish.title}</span>{wishlist.role !== "viewer" && !isArchived && <button className="inline-button" type="button" disabled={pending !== null} onClick={() => void archiveWish(wish, false)}>Wiederherstellen</button>}</div>)}</div>}</section>

    {isOwner && <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Mitverwaltung</p><h2>Jemanden einladen</h2></div></div><p>Die eingeladene Person kann sich mit ihrer E-Mail anmelden und bekommt genau die hier gewählte Rolle.</p><form className="import-form" onSubmit={createInvitation}><input type="email" value={inviteEmail} required maxLength={320} placeholder="name@beispiel.de" disabled={isArchived || pending !== null} onChange={(event) => setInviteEmail(event.target.value)} /><select className="admin-select" value={inviteRole} disabled={isArchived || pending !== null} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">Bearbeiten</option><option value="viewer">Nur ansehen</option></select><button className="primary-button" disabled={isArchived || pending !== null}>{pending === "invite" ? "Erstellt …" : "Einladen"}</button></form>{oneTimeInviteUrl && <div className="share-link-row invitation-link"><input readOnly value={oneTimeInviteUrl} aria-label="Einladungslink" /><button className="secondary-button" type="button" onClick={() => void navigator.clipboard?.writeText(oneTimeInviteUrl)}>Kopieren</button></div>}{members.length > 0 && <div className="admin-archived"><h3>Mitglieder</h3>{members.map((member) => <div className="admin-member-row" key={member.userId}><span>{member.displayName}{member.userId === currentUserId ? " · du" : ""}</span><select className="admin-select" value={member.role} disabled={isArchived || pending !== null} aria-label={`Rolle für ${member.displayName}`} onChange={(event) => void changeMemberRole(member.userId, event.target.value as AppWishlistMember["role"])}><option value="owner">Owner</option><option value="editor">Bearbeiten</option><option value="viewer">Nur ansehen</option></select><button className="inline-button danger-text" type="button" disabled={isArchived || pending !== null} onClick={() => void removeMember(member)}>Entfernen</button></div>)}</div>}{invitations.length > 0 && <div className="admin-archived"><h3>Einladungen</h3>{invitations.map((invitation) => <div className="admin-archived-row" key={invitation.id}><span>{invitation.email_normalized ?? "Persönlicher Link"} · {invitation.role}{invitation.accepted_at ? " · angenommen" : invitation.revoked_at ? " · widerrufen" : " · offen"}</span>{!invitation.accepted_at && !invitation.revoked_at && <button className="inline-button danger-text" type="button" disabled={pending !== null} onClick={() => void revokeInvitation(invitation.id)}>Widerrufen</button>}</div>)}</div>}</section>}

    {isOwner && !isArchived && <section className="import-panel"><div className="admin-section-head"><div><p className="eyebrow">Gemeinsam entscheiden</p><h2>Zweiten Elternteil gleichberechtigt einladen</h2></div></div><p>Ein zweiter Owner kann veröffentlichen, Mitglieder verwalten und die Liste genauso bearbeiten wie du.</p><form className="import-form" onSubmit={createCoOwnerInvitation}><input type="email" value={coOwnerEmail} required maxLength={320} placeholder="elternteil@beispiel.de" disabled={pending !== null} onChange={(event) => setCoOwnerEmail(event.target.value)} /><button className="secondary-button" disabled={pending !== null}>{pending === "invite-co-owner" ? "Erstellt …" : "Als Owner einladen"}</button></form></section>}

    {isOwner && <section className="import-panel admin-danger-zone"><div><p className="eyebrow">Abschluss</p><h2>Liste archivieren oder löschen</h2><p>{wishlist.deleteAfter ? `Die endgültige Löschung ist für den ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(wishlist.deleteAfter))} vorgemerkt.` : "Die Archivierung schließt die öffentliche Seite sofort. Bei der Löschung bleiben anschließend 90 Tage Zeit, es sich anders zu überlegen."}</p></div><div className="admin-danger-actions">{!isArchived && <button className="danger-button" type="button" disabled={pending !== null} onClick={() => void archiveList()}>{pending === "archive-list" ? "Archiviert …" : "Liste archivieren"}</button>}{!wishlist.deleteAfter && <button className="danger-button" type="button" disabled={pending !== null} onClick={() => void scheduleDeletion()}>{pending === "delete-list" ? "Vormerkt …" : "Löschung vormerken"}</button>}</div></section>}
  </div>;
}
