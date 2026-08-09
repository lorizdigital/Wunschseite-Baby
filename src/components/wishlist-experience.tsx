"use client";

import { useEffect, useMemo, useState } from "react";
import type { Wish } from "@/data/wishes";
import { PRODUCT_NAME } from "@/lib/brand";
import { ProductArtwork } from "./product-artwork";

type Status = "free" | "reserved";
type Filter = "all" | "free" | "reserved";
type Phase = "detail" | "reserve" | "success" | "manage";
type WishlistCopy = { title: string; intro: string; note: string };
type PublicWishlistApi = { statusUrl: string; reservationsUrl: string };

function Heart() {
  return <svg viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="18" fill="currentColor"/><path d="M11.5 17c0-4.8 6.1-6.6 7.5-2.4 1.5-4.2 7.5-2.4 7.5 2.4 0 4.1-4.8 7.6-7.5 9.5-2.7-1.9-7.5-5.4-7.5-9.5Z" fill="white"/></svg>;
}

function ExternalArrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4 6 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function WishlistExperience({
  wishlist,
  wishes,
  api,
  brandName = PRODUCT_NAME,
  reservationPasswordMinLength = 4,
  showMode = true,
  reservationsEnabled = true,
}: {
  wishlist: WishlistCopy;
  wishes: Wish[];
  api?: PublicWishlistApi;
  brandName?: string;
  reservationPasswordMinLength?: 4 | 8;
  showMode?: boolean;
  /** Used in the private parent preview: no public reservation data or actions. */
  reservationsEnabled?: boolean;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Wish | null>(null);
  const [phase, setPhase] = useState<Phase>("detail");
  const [guestName, setGuestName] = useState("");
  const [password, setPassword] = useState("");
  const [reservationKey, setReservationKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");

  useEffect(() => {
    if (!reservationsEnabled) return;
    let active = true;
    fetch(api?.statusUrl ?? "/api/reservations/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { reservedWishIds: string[]; mode?: "demo" | "live" }) => {
        if (!active) return;
        const next: Record<string, Status> = {};
        data.reservedWishIds.forEach((id) => { next[id] = "reserved"; });
        setStatuses(next);
        if (data.mode) setMode(data.mode);
      })
      .catch(() => active && setError("Der Reservierungsstatus konnte gerade nicht geladen werden."));
    return () => { active = false; };
  }, [api?.statusUrl, reservationsEnabled]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && closeDialog();
    document.body.classList.add("dialog-open");
    addEventListener("keydown", closeOnEscape);
    return () => { document.body.classList.remove("dialog-open"); removeEventListener("keydown", closeOnEscape); };
  }, [selected]);

  const counts = useMemo(() => {
    const reserved = wishes.filter((wish) => (statuses[wish.id] ?? "free") !== "free").length;
    return { free: wishes.length - reserved, reserved };
  }, [statuses, wishes]);

  const visible = useMemo(() => wishes.filter((wish) => {
    const status = statuses[wish.id] ?? "free";
    return filter === "all" || (filter === "free" ? status === "free" : status !== "free");
  }), [filter, statuses, wishes]);

  function openWish(wish: Wish) {
    setSelected(wish);
    setPhase(reservationsEnabled && statuses[wish.id] === "reserved" ? "manage" : "detail");
    setGuestName(""); setPassword(""); setReservationKey(""); setError("");
  }

  function closeDialog() { setSelected(null); setPhase("detail"); setGuestName(""); setPassword(""); setReservationKey(""); setError(""); }

  async function reserve() {
    if (!selected || pending) return;
    setPending(true); setError("");
    const idempotencyKey = reservationKey || crypto.randomUUID();
    if (!reservationKey) setReservationKey(idempotencyKey);
    try {
      const response = await fetch(api?.reservationsUrl ?? "/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wishId: selected.id, guestName: guestName.trim(), password, idempotencyKey }),
      });
      if (response.status === 409) {
        setStatuses((value) => ({ ...value, [selected.id]: "reserved" }));
        setPhase("manage"); setPassword(""); setError("Leider hat gerade jemand anderes diesen Wunsch reserviert."); return;
      }
      const result = await response.json() as { mode?: "demo" | "live"; error?: string };
      if (!response.ok) throw new Error(result.error);
      setStatuses((value) => ({ ...value, [selected.id]: "reserved" }));
      if (result.mode) setMode(result.mode);
      setPhase("success");
      setGuestName(""); setPassword("");
    } catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : "Das hat nicht geklappt. Bitte versuche es noch einmal."); }
    finally { setPending(false); }
  }

  async function cancel() {
    if (!selected || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(api?.reservationsUrl ?? "/api/reservations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wishId: selected.id, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Reservierung konnte nicht aufgehoben werden.");
      setStatuses((value) => ({ ...value, [selected.id]: "free" })); closeDialog();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Reservierung konnte nicht aufgehoben werden."); }
    finally { setPending(false); }
  }

  const selectedStatus = selected ? statuses[selected.id] ?? "free" : "free";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top"><span className="brand-mark"><Heart /></span><span>{brandName}</span></a>
        <div className="header-meta">{showMode && <span className={`mode-pill mode-${mode}`}>{mode === "demo" ? "Demo" : "Live"}</span>}<span className="header-lock">{reservationsEnabled ? "⌁ Nur mit Link" : "⌁ Entwurfsvorschau"}</span></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-art" aria-hidden="true"><span className="hero-sun"/><span className="hero-cloud hero-cloud-one"/><span className="hero-cloud hero-cloud-two"/><span className="hero-rainbow"><i/><i/><i/></span><span className="hero-star hero-star-one">✦</span><span className="hero-star hero-star-two">✧</span><span className="hero-moon">☾</span></div>
        <div className="hero-copy"><p className="eyebrow">Unsere Baby-Wunschliste</p><h1>{wishlist.title}</h1><p className="hero-intro">{wishlist.intro}</p><p className="no-account-note"><span>✓</span>{wishlist.note}</p></div>
      </section>

      <section className="wishlist-section" aria-labelledby="wishes-heading">
        <div className="wishlist-heading-row"><div><p className="eyebrow">Mit Liebe ausgesucht</p><h2 id="wishes-heading">Unsere Wünsche</h2></div><p className="wish-count"><strong>{counts.free}</strong> von {wishes.length} noch frei</p></div>
        <div className="filter-row" aria-label="Wünsche filtern">
          {([['all',`Alle ${wishes.length}`],['free',`Noch frei ${counts.free}`],['reserved',`Reserviert ${counts.reserved}`]] as const).map(([value,label]) => <button key={value} className={`filter-chip${filter===value?' active':''}`} aria-pressed={filter===value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {error && !selected && <p className="page-message" role="status">{error}</p>}
        {visible.length ? <div className="wish-grid">{visible.map((wish) => {
          const status = statuses[wish.id] ?? "free";
          return <article className={`wish-card status-${status}`} key={wish.id}><button className="wish-card-button" onClick={() => openWish(wish)}><div className="card-art-wrap"><ProductArtwork wish={wish}/><span className={`status-badge badge-${status}`}>{status === "free" ? "Noch frei" : "Reserviert"}</span></div><div className="wish-card-copy"><p className="shop-name">{wish.shop}</p><h3>{wish.title}</h3><div className="card-bottom"><span className="price">{wish.price}</span><span className="round-arrow">→</span></div></div></button></article>;
        })}</div> : <div className="empty-state"><span>♡</span><h3>Hier ist gerade nichts zu sehen</h3><p>Wähle einen anderen Filter.</p></div>}
      </section>

      <section className="how-it-works"><p className="eyebrow">Ganz unkompliziert</p><h2>{reservationsEnabled ? "So funktioniert’s" : "So wird die Liste aussehen"}</h2><div className="steps"><div><span>1</span><h3>Wunsch auswählen</h3><p>Schau dir in Ruhe an, was noch frei ist.</p></div><div><span>2</span><h3>{reservationsEnabled ? "Mit Passwort reservieren" : "Wünsche mit Liebe ordnen"}</h3><p>{reservationsEnabled ? "Name und ein einfaches Passwort genügen. Beides bleibt privat." : "Nach der Veröffentlichung können Gäste jeden Wunsch einzeln ansehen."}</p></div><div><span>3</span><h3>{reservationsEnabled ? "Beim Anbieter kaufen" : "In Ruhe veröffentlichen"}</h3><p>{reservationsEnabled ? "Der Shop öffnet sich separat." : "Reservierungen sind in dieser privaten Vorschau bewusst deaktiviert."}</p></div></div></section>
      <footer><div className="footer-mark"><Heart /></div><p>Danke, dass ihr euch mit uns freut.</p><small>Private Wunschliste · Nur für Familie und Freunde</small><div className="footer-legal"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></div><a className="footer-credit" href="https://loriz.digital" target="_blank" rel="noreferrer">Designed and developed by Loriz Digital</a></footer>

      {selected && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}><section className="wish-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={closeDialog} aria-label="Schließen">×</button><div className="dialog-art"><ProductArtwork wish={selected} compact/></div><div className="dialog-content"><p className="shop-name">{selected.shop}</p><h2 id="dialog-title">{selected.title}</h2><p className="dialog-price">{selected.price}</p><p className="dialog-note">{selected.note}</p>
        {phase === "detail" && <>{reservationsEnabled && (selectedStatus === "reserved" ? <div className="reserved-message"><span>✓</span><div><strong>Dieser Wunsch ist reserviert</strong><p>Jemand anderes kümmert sich bereits darum.</p></div></div> : <p className="dialog-explainer">Die Reservierung verhindert doppelte Geschenke. Gekauft wird anschließend beim Anbieter.</p>)}{!reservationsEnabled && <p className="dialog-explainer">Dies ist deine private Vorschau. Reservierungen werden erst mit der Veröffentlichung aktiviert.</p>}{error && <p className="form-error">{error}</p>}<div className="dialog-actions">{reservationsEnabled && selectedStatus === "free" && <button className="primary-button" onClick={() => setPhase("reserve")}>Wunsch reservieren</button>}{selected.productUrl !== "#" && <a className="secondary-button" href={selected.productUrl} target="_blank" rel="noreferrer">Beim Anbieter ansehen <ExternalArrow/></a>}</div></>}
        {phase === "reserve" && <><div className="reserve-copy"><h3>Möchtest du diesen Wunsch reservieren?</h3><p>Dein Name und Passwort werden anderen Gästen nicht angezeigt.</p></div><label className="field-label" htmlFor="guest-name">Dein Name</label><input className="text-field" id="guest-name" maxLength={80} autoFocus autoComplete="name" placeholder="Zum Beispiel: Anna" value={guestName} onChange={(event) => setGuestName(event.target.value)}/><label className="field-label" htmlFor="reserve-password">Dein Passwort</label><input className="text-field" id="reserve-password" type="password" minLength={reservationPasswordMinLength} maxLength={64} autoComplete="new-password" placeholder={`Mindestens ${reservationPasswordMinLength} Zeichen`} value={password} onChange={(event) => setPassword(event.target.value)}/><p className="field-help">Merke dir das Passwort. Damit kannst du die Reservierung später wieder aufheben.</p>{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button className="primary-button" onClick={reserve} disabled={pending || !guestName.trim() || password.length < reservationPasswordMinLength}>{pending?"Wird reserviert …":"Jetzt reservieren"}</button><button className="text-button" onClick={() => { setPhase("detail"); setPassword(""); setError(""); }}>Zurück</button></div></>}
        {phase === "success" && <div className="success-panel"><span className="success-icon">✓</span><h3>Für dich reserviert</h3><p>Niemand anderes kann diesen Wunsch jetzt reservieren.</p><div className="link-reminder"><strong>Passwort merken:</strong> Möchtest du die Reservierung später aufheben, klickst du einfach wieder auf diesen Wunsch und gibst dasselbe Passwort ein.</div><div className="dialog-actions"><a className="primary-button" href={selected.productUrl} target="_blank" rel="noreferrer">Zum Anbieter <ExternalArrow/></a><button className="secondary-button" onClick={closeDialog}>Fertig</button></div></div>}
        {phase === "manage" && <><div className="reserved-message"><span>✓</span><div><strong>Dieser Wunsch ist reserviert</strong><p>Mit dem bei der Reservierung gewählten Passwort kann er wieder freigegeben werden.</p></div></div><label className="field-label" htmlFor="cancel-password">Passwort zum Aufheben</label><input className="text-field" id="cancel-password" type="password" minLength={reservationPasswordMinLength} maxLength={64} autoFocus autoComplete="current-password" placeholder="Dein Reservierungspasswort" value={password} onChange={(event) => setPassword(event.target.value)}/>{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><a className="secondary-button" href={selected.productUrl} target="_blank" rel="noreferrer">Beim Anbieter ansehen <ExternalArrow/></a><button className="danger-button" onClick={cancel} disabled={pending || password.length < reservationPasswordMinLength}>{pending?"Wird freigegeben …":"Reservierung aufheben"}</button></div></>}
      </div></section></div>}
    </main>
  );
}
