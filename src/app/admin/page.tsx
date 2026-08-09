import Link from "next/link";
import { notFound } from "next/navigation";
import { WishManager } from "@/components/wish-manager";
import { isLegacyMatsAdminEnabled } from "@/lib/app-config";
import { PRODUCT_NAME } from "@/lib/brand";

export default function AdminPage() {
  if (!isLegacyMatsAdminEnabled()) notFound();
  return <main className="admin-page"><div className="admin-wrap">
    <Link className="brand" href="/">← {PRODUCT_NAME}</Link>
    <header className="admin-head"><p className="eyebrow">Interne Verwaltung · Noindex</p><h1>Wünsche verwalten</h1><p>Fügt Produktlinks hinzu, korrigiert Angaben und bestimmt die Reihenfolge auf der öffentlichen Wunschliste.</p></header>
    <WishManager />
  </div></main>;
}
