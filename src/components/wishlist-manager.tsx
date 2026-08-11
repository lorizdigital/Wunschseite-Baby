"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AppWishlist, AppWishlistMember, AppWish } from "@/lib/app-wishlist-data";
import { ACCESS_CODE_MAX_LENGTH, ACCESS_CODE_MIN_LENGTH, validateAccessCode } from "@/lib/access-code";
import { SecretInput } from "@/components/secret-input";

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

type ProductDraft = {
  title: string;
  description: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
  shop: string;
  sourceUrl: string;
};

const emptyWish: WishDraft = {
  title: "", description: "", productUrl: "", imageUrl: "", priceAmount: "", currency: "EUR", shopName: "",
};

const WISH_URL_MAX_LENGTH = 2048;

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

function WishFields({ draft, onChange, idPrefix, showLinks = true }: { draft: WishDraft; onChange: (next: WishDraft) => void; idPrefix: string; showLinks?: boolean }) {
  const update = (field: keyof WishDraft, value: string) => onChange({ ...draft, [field]: value });
  return <div className="admin-field-grid">
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-title`}>Wunsch<input id={`${idPrefix}-title`} value={draft.title} maxLength={180} required onChange={(event) => update("title", event.target.value)} /></label>
    <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-description`}>Beschreibung <span>optional</span><textarea id={`${idPrefix}-description`} value={draft.description} maxLength={600} rows={3} onChange={(event) => update("description", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-shop`}>Shop <span>optional</span><input id={`${idPrefix}-shop`} value={draft.shopName} maxLength={100} onChange={(event) => update("shopName", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-price`}>Preis <span>optional</span><input id={`${idPrefix}-price`} type="number" min="0" max="999999" step="0.01" inputMode="decimal" value={draft.priceAmount} onChange={(event) => update("priceAmount", event.target.value)} /></label>
    <label className="admin-field" htmlFor={`${idPrefix}-currency`}>Währung<input id={`${idPrefix}-currency`} value={draft.currency} maxLength={3} pattern="[A-Za-z]{3}" onChange={(event) => update("currency", event.target.value.toUpperCase())} /></label>
    {showLinks && <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-product`}>Produktlink <span>optional</span><input id={`${idPrefix}-product`} type="url" value={draft.productUrl} maxLength={2048} placeholder="https://…" onChange={(event) => update("productUrl", event.target.value)} /></label>}
    {showLinks && <label className="admin-field admin-field-wide" htmlFor={`${idPrefix}-image`}>Bildlink <span>optional</span><input id={`${idPrefix}-image`} type="url" value={draft.imageUrl} maxLength={2048} placeholder="https://…" onChange={(event) => update("imageUrl", event.target.value)} /></label>}
  </div>;
}

function formatPrice(wish: AppWish) {
  if (wish.priceAmount === null) return "Preis offen";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: wish.currency || "EUR" }).format(wish.priceAmount);
}

function ChecklistMark({ done }: { done: boolean }) {
  return done
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8.4 12.2 2.5 2.5 4.7-5" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /></svg>;
}

function StatusInfoIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.7v.1" /></svg>;
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
  const [lastImportedUrl, setLastImportedUrl] = useState("");
  const [editingWish, setEditingWish] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WishDraft>(emptyWish);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [coOwnerEmail, setCoOwnerEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [oneTimeManagementInviteUrl, setOneTimeManagementInviteUrl] = useState("");
  const [oneTimeCoOwnerInviteUrl, setOneTimeCoOwnerInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [showImmediateDeletion, setShowImmediateDeletion] = useState(false);
  const [deletionTitle, setDeletionTitle] = useState("");
  const immediateDeletionInputRef = useRef<HTMLInputElement>(null);
  const immediateDeletionTriggerRef = useRef<HTMLButtonElement>(null);
  const isOwner = wishlist.role === "owner";
  const isArchived = Boolean(wishlist.archivedAt);
  const activeWishes = useMemo(() => wishes.filter((wish) => !wish.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder), [wishes]);
  const archivedWishes = useMemo(() => wishes.filter((wish) => wish.archivedAt), [wishes]);
  const accessCodeValidation = validateAccessCode(accessCode);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    fetch(`/api/app/wishlists/${wishlist.id}/invitations`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { invitations: Invitation[] }) => active && setInvitations(data.invitations))
      .catch(() => active && setError("Einladungen konnten gerade nicht geladen werden."));
    return () => { active = false; };
  }, [isOwner, wishlist.id]);

  useEffect(() => {
    if (showImmediateDeletion) immediateDeletionInputRef.current?.focus();
  }, [showImmediateDeletion]);

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
      const data = await requestJson<{ wish: { wish_id: string; sort_order: number; image_url: string | null } }>(`/api/app/wishlists/${wishlist.id}/wishes`, "POST", toPayload(newWish));
      setWishes((current) => [...current, {
        id: data.wish.wish_id, title: newWish.title.trim(), description: newWish.description.trim(), productUrl: newWish.productUrl.trim() || null,
        imageUrl: data.wish.image_url, priceAmount: newWish.priceAmount.trim() === "" ? null : Number(newWish.priceAmount),
        currency: newWish.currency.trim().toUpperCase(), shopName: newWish.shopName.trim() || "Wunsch", sortOrder: data.wish.sort_order, archivedAt: null,
      }]);
      setNewWish(emptyWish); setLastImportedUrl(""); setMessage("Der Wunsch ist angelegt.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Wunsch konnte nicht angelegt werden."); }
    finally { finish(); }
  }

  async function importProductDetails() {
    const requestedUrl = newWish.productUrl.trim();
    if (!requestedUrl || requestedUrl === lastImportedUrl) return;
    start("import-wish");
    try {
      const data = await requestJson<{ draft: ProductDraft }>(`/api/app/wishlists/${wishlist.id}/product-import`, "POST", { url: requestedUrl });
      if (data.draft.sourceUrl.length > WISH_URL_MAX_LENGTH) {
        throw new Error("Der bereinigte Produktlink ist länger als 2.048 Zeichen und kann nicht als Wunsch gespeichert werden.");
      }
      const importedCurrency = data.draft.currency?.trim().toUpperCase() ?? "";
      setNewWish((current) => current.productUrl.trim() !== requestedUrl ? current : {
        ...current,
        title: data.draft.title,
        description: data.draft.description,
        productUrl: data.draft.sourceUrl,
        imageUrl: data.draft.imageUrl ?? "",
        priceAmount: data.draft.price?.replace(",", ".") ?? "",
        currency: /^[A-Z]{3}$/.test(importedCurrency) ? importedCurrency : "EUR",
        shopName: data.draft.shop,
      });
      setLastImportedUrl(data.draft.sourceUrl);
      setMessage("Produktdaten und Bild wurden übernommen. Prüfe die Angaben und speichere den Wunsch anschließend.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Produktlink konnte nicht importiert werden."); }
    finally { finish(); }
  }

  async function saveWish(wishId: string) {
    start(`wish-${wishId}`);
    try {
      const data = await requestJson<{ imageUrl: string | null }>(`/api/app/wishlists/${wishlist.id}/wishes/${wishId}`, "PATCH", toPayload(editDraft));
      setWishes((current) => current.map((wish) => wish.id !== wishId ? wish : {
        ...wish, title: editDraft.title.trim(), description: editDraft.description.trim(), productUrl: editDraft.productUrl.trim() || null,
        imageUrl: data.imageUrl, priceAmount: editDraft.priceAmount.trim() === "" ? null : Number(editDraft.priceAmount),
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
      setMessage("Die Liste ist jetzt für Menschen mit Link und Zugangscode sichtbar.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht veröffentlicht werden."); }
    finally { finish(); }
  }

  async function saveAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessCodeValidation.valid) { setError(accessCodeValidation.message); return; }
    start("access-code");
    try {
      const data = await requestJson<{ accessCodeSet: boolean }>(`/api/app/wishlists/${wishlist.id}/access-code`, "POST", { accessCode });
      if (!data.accessCodeSet) throw new Error("Der Zugangscode konnte nicht gespeichert werden.");
      setWishlist((current) => ({ ...current, accessCodeSet: true, visibility: "access_code" }));
      setMessage("Der Zugangscode ist gespeichert. Mit dem Auge kannst du ihn auf dieser Seite noch einmal prüfen; nach dem Neuladen kann er aus Sicherheitsgründen nur ersetzt, nicht wieder ausgelesen werden.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Der Zugangscode konnte nicht gespeichert werden."); }
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

  async function deleteImmediately(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deletionTitle.trim() !== wishlist.title) {
      setError("Der eingegebene Titel stimmt nicht mit dem Listentitel überein.");
      return;
    }
    start("delete-immediately");
    try {
      await requestJson<{ deleted: true }>(`/api/app/wishlists/${wishlist.id}/deletion?mode=immediate`, "POST", { action: "delete_immediately", expectedTitle: deletionTitle });
      window.location.assign("/app?deleted=1");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Liste konnte nicht endgültig gelöscht werden.");
      finish();
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("invite");
    try {
      const data = await requestJson<{ invitation: Invitation; acceptUrl: string; emailStatus: "sent" | "not_configured" | "failed" }>(`/api/app/wishlists/${wishlist.id}/invitations`, "POST", { email: inviteEmail, role: inviteRole });
      setInvitations((current) => [data.invitation, ...current]); setInviteEmail(""); setOneTimeManagementInviteUrl(data.acceptUrl);
      setMessage(data.emailStatus === "sent" ? "Die Einladung ist erstellt und wurde per E-Mail verschickt. Teile den Link unten bei Bedarf zusätzlich sicher." : data.emailStatus === "not_configured" ? "Die Einladung ist erstellt, aber der E-Mail-Versand ist noch nicht konfiguriert. Teile den Link unten sicher mit dieser Person." : "Die Einladung ist erstellt, aber die E-Mail konnte gerade nicht verschickt werden. Teile den Link unten sicher mit dieser Person.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Einladung konnte nicht erstellt werden."); }
    finally { finish(); }
  }

  async function createCoOwnerInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("invite-co-owner");
    try {
      const data = await requestJson<{ invitation: Invitation; acceptUrl: string; emailStatus: "sent" | "not_configured" | "failed" }>(`/api/app/wishlists/${wishlist.id}/invitations`, "POST", { email: coOwnerEmail, role: "owner" });
      setInvitations((current) => [data.invitation, ...current]); setCoOwnerEmail(""); setOneTimeCoOwnerInviteUrl(data.acceptUrl);
      setMessage(data.emailStatus === "sent" ? "Die gleichberechtigte Owner-Einladung ist erstellt und wurde per E-Mail verschickt." : data.emailStatus === "not_configured" ? "Die Owner-Einladung ist erstellt, aber der E-Mail-Versand ist noch nicht konfiguriert. Teile den Link unten sicher." : "Die Owner-Einladung ist erstellt, aber die E-Mail konnte gerade nicht verschickt werden. Teile den Link unten sicher.");
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
    {isOwner && isArchived && <p className="form-error list-status-band"><StatusInfoIcon />Diese Liste ist archiviert und kann nicht weiter bearbeitet werden.</p>}
    {(message || error) && <p className={error ? "form-error" : "form-success"} role="status">{error || message}</p>}

    {isOwner && <section className="import-panel list-details-panel"><div className="admin-section-head"><div><p className="eyebrow">Liste</p><h2>Deine Worte</h2></div></div><form onSubmit={saveDetails} className="admin-stack"><label className="admin-field">Titel<input value={title} maxLength={180} required disabled={isArchived || pending !== null} onChange={(event) => setTitle(event.target.value)} /></label><label className="admin-field">Einleitung <span>optional</span><textarea value={intro} maxLength={2000} rows={4} disabled={isArchived || pending !== null} onChange={(event) => setIntro(event.target.value)} /></label><div className="admin-form-actions"><button className="primary-button" disabled={isArchived || pending !== null}>{pending === "details" ? "Speichert …" : "Texte speichern"}</button></div></form></section>}

    {isOwner && <section className="import-panel access-code-panel"><div className="admin-section-head"><div><p className="eyebrow">Pflichtschutz</p><h2>Die Liste muss geschützt werden</h2></div></div><p>{wishlist.accessCodeSet ? "Ein Zugangscode ist eingerichtet. Er wird nicht im Klartext gespeichert und kann deshalb nur ersetzt werden. Teile Link und Code möglichst getrennt." : "Ohne Zugangscode kann die Liste nicht veröffentlicht werden. Lege jetzt einen Code mit mindestens 8 Zeichen fest."}</p><form className="import-form" onSubmit={saveAccessCode}><div className="access-code-input-group"><SecretInput aria-label={wishlist.accessCodeSet ? "Neuen Zugangscode für Familie und Freunde festlegen" : "Zugangscode für Familie und Freunde festlegen"} required minLength={ACCESS_CODE_MIN_LENGTH} maxLength={ACCESS_CODE_MAX_LENGTH} autoComplete="new-password" value={accessCode} disabled={isArchived || pending !== null} placeholder={wishlist.accessCodeSet ? "Neuen Zugangscode festlegen" : "Zugangscode festlegen"} aria-describedby="wishlist-access-code-validation" aria-invalid={accessCode.length > 0 && !accessCodeValidation.valid} onChange={(event) => setAccessCode(event.target.value)} /><p id="wishlist-access-code-validation" className={`field-validation field-validation-${accessCodeValidation.kind}`} aria-live="polite">{accessCodeValidation.message}</p></div><button className="secondary-button" disabled={isArchived || pending !== null || !accessCodeValidation.valid}>{pending === "access-code" ? "Speichert …" : wishlist.accessCodeSet ? "Code ersetzen" : "Code speichern"}</button></form></section>}

    {isOwner && <section className="import-panel share-with-family"><div className="admin-section-head"><div><p className="eyebrow"><span>Für Familie &amp; Freunde</span> · <span className="eyebrow-condition">kein Konto nötig</span></p><h2>Liste sicher teilen</h2></div></div><p>{wishlist.publishedAt && wishlist.publicSlug ? "Die Familie öffnet die Liste mit dem Freigabelink und gibt anschließend den Zugangscode ein. Sie kann Wünsche ansehen und reservieren, aber nichts verwalten." : publicationEnabled ? "Sobald ein Zugangscode und mindestens ein Wunsch vorhanden sind, kannst du die Liste veröffentlichen. Familie und Freunde benötigen kein Wünschi-Konto." : "Die Veröffentlichung ist für diese Umgebung noch nicht freigeschaltet."}</p>{!wishlist.publishedAt && <ul className="publication-checklist"><li className={wishlist.accessCodeSet ? "is-ready" : ""}><ChecklistMark done={wishlist.accessCodeSet} /><span aria-hidden="true">Zugangscode eingerichtet</span><span className="sr-only">{wishlist.accessCodeSet ? "Erledigt: Zugangscode eingerichtet." : "Offen: Zugangscode einrichten."}</span></li><li className={activeWishes.length > 0 ? "is-ready" : ""}><ChecklistMark done={activeWishes.length > 0} /><span aria-hidden="true">Mindestens ein aktiver Wunsch</span><span className="sr-only">{activeWishes.length > 0 ? "Erledigt: Mindestens ein aktiver Wunsch ist vorhanden." : "Offen: Mindestens einen aktiven Wunsch hinzufügen."}</span></li></ul>}{wishlist.publishedAt && wishlist.publicSlug && <><div className="share-link-row"><input readOnly value={shareUrl} aria-label="Freigabelink für Familie und Freunde" /><a className="secondary-button" href={`/w/${wishlist.publicSlug}`} target="_blank" rel="noreferrer">Familienansicht öffnen</a></div><p className="field-help">Diesen Freigabelink weitergeben – nicht den persönlichen Einladungslink für Mitverwaltende.</p></>}{publicationEnabled && !wishlist.publishedAt && (!wishlist.accessCodeSet || activeWishes.length === 0) && <p className="field-help">Erledige die noch offenen Punkte; danach wird die Veröffentlichung freigeschaltet.</p>}<div className="admin-form-actions"><a className="secondary-button" href={`/app/lists/${wishlist.id}/preview`} target="_blank" rel="noreferrer">Private Vorschau öffnen</a></div>{wishlist.publishedAt && wishlist.publicSlug && <div className="admin-form-actions"><button className="secondary-button" type="button" onClick={() => void rotateLink()} disabled={isArchived || pending !== null}>{pending === "share-link" ? "Erneuert …" : "Freigabelink erneuern"}</button></div>}{publicationEnabled && !wishlist.publishedAt && <div className="admin-form-actions"><button className="primary-button" type="button" disabled={isArchived || pending !== null || activeWishes.length === 0 || !wishlist.accessCodeSet} onClick={() => void publish()}>{pending === "publish" ? "Veröffentlicht …" : !wishlist.accessCodeSet ? "Zugangscode fehlt" : activeWishes.length === 0 ? "Zuerst einen Wunsch hinzufügen" : "Jetzt veröffentlichen"}</button></div>}</section>}

    {!isArchived && wishlist.role !== "viewer" && <section className="import-panel product-import-panel"><div className="admin-section-head"><div><p className="eyebrow">Wünsche</p><h2>Produktlink einfügen</h2></div></div><p>{productImportEnabled ? "Füge zuerst den Link zur Produktseite ein. Wünschi übernimmt Titel, Anbieter, Preis und Produktbild automatisch; vor dem Speichern kannst du alles anpassen." : "Trage die Produktangaben ein. Der automatische Import ist vorübergehend nicht verfügbar."}</p>{productImportEnabled && <div className="product-import-box"><form className="import-form" onSubmit={(event) => { event.preventDefault(); void importProductDetails(); }}><input aria-label="Produktlink automatisch auslesen" type="url" required value={newWish.productUrl} maxLength={WISH_URL_MAX_LENGTH} placeholder="https://shop.de/produkt/…" disabled={pending !== null} onChange={(event) => { setNewWish((current) => ({ ...current, productUrl: event.target.value })); setLastImportedUrl(""); }} /><button className="secondary-button" type="submit" disabled={pending !== null || !newWish.productUrl.trim()}>{pending === "import-wish" ? "Liest Produktdaten …" : "Produktdaten übernehmen"}</button></form>{newWish.imageUrl && <div className="product-import-preview"><div className="admin-item-image product-import-preview-placeholder" aria-hidden="true">♡</div><span>Produktbild erkannt und wird beim Speichern sicher übernommen.</span></div>}</div>}<form className="admin-stack" onSubmit={addWish}><WishFields draft={newWish} onChange={setNewWish} idPrefix="new-wish" showLinks={!productImportEnabled} /><div className="admin-form-actions"><button className="primary-button" disabled={pending !== null || !newWish.title.trim()}>{pending === "new-wish" ? "Legt an …" : "Wunsch speichern"}</button></div></form></section>}

    <section className="import-panel wish-list-panel"><div className="admin-section-head"><div><p className="eyebrow">Wunschliste</p><h2>{activeWishes.length} aktive {activeWishes.length === 1 ? "Idee" : "Ideen"}</h2></div></div>{activeWishes.length ? <div className="admin-items">{activeWishes.map((wish, index) => <article className="admin-item" key={wish.id}><WishThumbnail imageUrl={wish.imageUrl} /><div className="admin-item-copy"><strong>{wish.title}</strong><small>{wish.shopName} · {formatPrice(wish)}</small>{wish.description && <small>{wish.description}</small>}</div>{wishlist.role !== "viewer" && !isArchived && <div className="admin-item-order"><button aria-label={`${wish.title} nach oben`} disabled={index === 0 || pending !== null} onClick={() => void moveWish(wish.id, -1)}>↑</button><button aria-label={`${wish.title} nach unten`} disabled={index === activeWishes.length - 1 || pending !== null} onClick={() => void moveWish(wish.id, 1)}>↓</button></div>}{wishlist.role !== "viewer" && !isArchived && <div className="admin-item-actions"><button className="inline-button" type="button" disabled={pending !== null} onClick={() => { setEditingWish(wish.id); setEditDraft(toDraft(wish)); }}>Bearbeiten</button><button className="inline-button danger-text" type="button" disabled={pending !== null} onClick={() => void archiveWish(wish, true)}>Archivieren</button></div>}{editingWish === wish.id && <form className="admin-edit-form" onSubmit={(event) => { event.preventDefault(); void saveWish(wish.id); }}><WishFields draft={editDraft} onChange={setEditDraft} idPrefix={`wish-${wish.id}`} /><div className="admin-form-actions"><button className="primary-button" disabled={pending !== null}>{pending === `wish-${wish.id}` ? "Speichert …" : "Speichern"}</button><button className="secondary-button" type="button" onClick={() => setEditingWish(null)} disabled={pending !== null}>Abbrechen</button></div></form>}</article>)}</div> : <p>Hier warten noch keine Wünsche auf euch.</p>}{archivedWishes.length > 0 && <div className="admin-archived"><h3>Archivierte Wünsche</h3>{archivedWishes.map((wish) => <div className="admin-archived-row" key={wish.id}><span>{wish.title}</span>{wishlist.role !== "viewer" && !isArchived && <button className="inline-button" type="button" disabled={pending !== null} onClick={() => void archiveWish(wish, false)}>Wiederherstellen</button>}</div>)}</div>}</section>

    {isOwner && <section className="import-panel management-access-panel"><div className="admin-section-head"><div><p className="eyebrow"><span>Weitere Mitverwaltung</span> · <span className="eyebrow-condition">eigenes Konto nötig</span></p><h2>Eine weitere Person einladen</h2></div></div><p>Diese persönliche Einladung ist nur für Menschen gedacht, die in Wünschi mitarbeiten sollen – nicht für Familie und Freunde, die lediglich Wünsche ansehen und reservieren.</p><form className="import-form" onSubmit={createInvitation}><input aria-label="E-Mail-Adresse der eingeladenen Person" type="email" value={inviteEmail} required maxLength={320} placeholder="name@beispiel.de" disabled={isArchived || pending !== null} onChange={(event) => setInviteEmail(event.target.value)} /><select aria-label="Rolle der eingeladenen Person" className="admin-select" value={inviteRole} disabled={isArchived || pending !== null} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">Kann Wünsche bearbeiten</option><option value="viewer">Angemeldete Ansicht</option></select><button className="primary-button" disabled={isArchived || pending !== null}>{pending === "invite" ? "Erstellt …" : "Persönlich einladen"}</button></form>{oneTimeManagementInviteUrl && <><div className="share-link-row invitation-link"><input readOnly value={oneTimeManagementInviteUrl} aria-label="Persönlicher Einladungslink zur Mitverwaltung" /><button className="secondary-button" type="button" onClick={() => void navigator.clipboard?.writeText(oneTimeManagementInviteUrl)}>Kopieren</button></div><p className="field-help">Dieser Link gewährt Kontozugriff zur Verwaltung. Nicht als Familien-Freigabelink verwenden.</p></>}{members.length > 0 && <div className="admin-archived"><h3>Mitverwaltende</h3>{members.map((member) => <div className="admin-member-row" key={member.userId}><span>{member.displayName}{member.userId === currentUserId ? " · du" : ""}</span><select className="admin-select" value={member.role} disabled={isArchived || pending !== null} aria-label={`Rolle für ${member.displayName}`} onChange={(event) => void changeMemberRole(member.userId, event.target.value as AppWishlistMember["role"])}><option value="owner">Gleichberechtigte Verwaltung</option><option value="editor">Kann Wünsche bearbeiten</option><option value="viewer">Angemeldete Ansicht</option></select><button className="inline-button danger-text" type="button" disabled={pending !== null || member.userId === currentUserId} onClick={() => void removeMember(member)}>Entfernen</button></div>)}</div>}{invitations.length > 0 && <div className="admin-archived"><h3>Persönliche Einladungen</h3>{invitations.map((invitation) => <div className="admin-archived-row" key={invitation.id}><span>{invitation.email_normalized ?? "Persönlicher Link"} · {invitation.role === "owner" ? "gleichberechtigte Verwaltung" : invitation.role === "editor" ? "kann bearbeiten" : "angemeldete Ansicht"}{invitation.accepted_at ? " · angenommen" : invitation.revoked_at ? " · widerrufen" : " · offen"}</span>{!invitation.accepted_at && !invitation.revoked_at && <button className="inline-button danger-text" type="button" disabled={pending !== null} onClick={() => void revokeInvitation(invitation.id)}>Widerrufen</button>}</div>)}</div>}</section>}

    {isOwner && !isArchived && <section className="import-panel co-owner-access-panel"><div className="admin-section-head"><div><p className="eyebrow"><span>Zweiter Elternteil</span> · <span className="eyebrow-condition">eigenes Konto nötig</span></p><h2>Gleichberechtigt gemeinsam verwalten</h2></div></div><p>Der zweite Elternteil erhält dieselben Rechte wie du: Wünsche bearbeiten, veröffentlichen, Freigaben verwalten und weitere Personen einladen.</p><form className="import-form" onSubmit={createCoOwnerInvitation}><input aria-label="E-Mail-Adresse des zweiten Elternteils" type="email" value={coOwnerEmail} required maxLength={320} placeholder="elternteil@beispiel.de" disabled={pending !== null} onChange={(event) => setCoOwnerEmail(event.target.value)} /><button className="primary-button" disabled={pending !== null}>{pending === "invite-co-owner" ? "Erstellt …" : "Zweiten Elternteil einladen"}</button></form>{oneTimeCoOwnerInviteUrl && <><div className="share-link-row invitation-link"><input readOnly value={oneTimeCoOwnerInviteUrl} aria-label="Persönlicher Einladungslink für den zweiten Elternteil" /><button className="secondary-button" type="button" onClick={() => void navigator.clipboard?.writeText(oneTimeCoOwnerInviteUrl)}>Kopieren</button></div><p className="field-help">Dieser persönliche Link ist nur für den eingeladenen Elternteil bestimmt.</p></>}</section>}

    {isOwner && <section className="import-panel admin-danger-zone"><div className="admin-danger-copy"><p className="eyebrow">Abschluss</p><h2>Liste archivieren oder löschen</h2><p>{wishlist.deleteAfter ? `Die endgültige Löschung ist für den ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(wishlist.deleteAfter))} vorgemerkt. Du kannst sie stattdessen auch sofort endgültig löschen.` : "Archivieren blendet die Liste sofort aus. Du kannst außerdem eine Löschung in 90 Tagen vormerken oder alle Listendaten sofort endgültig löschen."}</p>{showImmediateDeletion && <form id="immediate-deletion-confirmation" className="immediate-deletion-confirmation" role="region" aria-labelledby="immediate-deletion-title-heading" onSubmit={deleteImmediately}><h3 id="immediate-deletion-title-heading">Endgültige Löschung bestätigen</h3><p>Wünsche, Reservierungen, Einladungen und Zugriffsrechte werden unwiderruflich gelöscht. Gib zur Bestätigung den exakten Listentitel ein:</p><label className="admin-field" htmlFor="immediate-deletion-title"><span>{wishlist.title}</span><input ref={immediateDeletionInputRef} id="immediate-deletion-title" value={deletionTitle} autoComplete="off" disabled={pending !== null} onChange={(event) => setDeletionTitle(event.target.value)} /></label><div className="admin-form-actions"><button className="danger-button danger-button-immediate" disabled={pending !== null || deletionTitle.trim() !== wishlist.title}>{pending === "delete-immediately" ? "Löscht endgültig …" : "Jetzt unwiderruflich löschen"}</button><button className="secondary-button" type="button" disabled={pending !== null} onClick={() => { setShowImmediateDeletion(false); setDeletionTitle(""); immediateDeletionTriggerRef.current?.focus(); }}>Abbrechen</button></div></form>}</div><div className="admin-danger-actions">{!isArchived && <button className="danger-button" type="button" disabled={pending !== null} onClick={() => void archiveList()}>{pending === "archive-list" ? "Archiviert …" : "Nur archivieren"}</button>}{!wishlist.deleteAfter && <button className="danger-button" type="button" disabled={pending !== null} onClick={() => void scheduleDeletion()}>{pending === "delete-list" ? "Vormerkt …" : "Löschung in 90 Tagen"}</button>}<button ref={immediateDeletionTriggerRef} className="danger-button danger-button-immediate" type="button" aria-expanded={showImmediateDeletion} aria-controls={showImmediateDeletion ? "immediate-deletion-confirmation" : undefined} disabled={pending !== null} onClick={() => setShowImmediateDeletion(true)}>Jetzt endgültig löschen</button></div></section>}
  </div>;
}
