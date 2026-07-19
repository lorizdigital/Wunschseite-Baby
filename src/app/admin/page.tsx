import Link from "next/link";
import { WishManager } from "@/components/wish-manager";

export default function AdminPage() {
  return <main className="admin-page"><div className="admin-wrap">
    <Link className="brand" href="/">← Mats’ Wünsche</Link>
    <header className="admin-head"><p className="eyebrow">Interne Verwaltung · Noindex</p><h1>Wünsche verwalten</h1><p>Fügt Produktlinks hinzu, korrigiert Angaben und bestimmt die Reihenfolge auf der öffentlichen Wunschliste.</p></header>
    <WishManager />
  </div></main>;
}
