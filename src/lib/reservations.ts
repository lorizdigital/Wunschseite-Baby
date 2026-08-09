import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { wishes as fallbackWishes } from "@/data/wishes";
import { getSupabaseAdmin, MATS_WISHLIST_ID } from "@/lib/supabase-admin";

type DemoReservation = { wishId: string; guestName: string; passwordSalt: string; passwordHash: string };
type PublicReservationStatusRow = { wish_id: string };
declare global { var __matsReservations: Map<string, DemoReservation> | undefined; }
const demoStore = globalThis.__matsReservations ?? new Map<string, DemoReservation>();
globalThis.__matsReservations = demoStore;
const fallbackMatsWishIds = new Set(fallbackWishes.map((wish) => wish.id));
for (const [wishId, reservation] of demoStore) {
  if (!reservation.passwordHash || !reservation.passwordSalt) demoStore.delete(wishId);
}

function passwordDigest(password: string, salt: string) {
  return scryptSync(password, salt, 32);
}

function demoModeIsAllowed() {
  return process.env.NODE_ENV !== "production";
}

function passwordMatches(password: string, reservation: DemoReservation) {
  if (!reservation.passwordHash || !reservation.passwordSalt) return false;
  const actual = passwordDigest(password, reservation.passwordSalt);
  const expected = Buffer.from(reservation.passwordHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getLiveReservationStatus(wishlistId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_public_reservation_status_v1", { p_wishlist_id: wishlistId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PublicReservationStatusRow[]).map((row) => row.wish_id);
}

export async function getMatsReservationStatus() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (!demoModeIsAllowed()) throw new Error("Supabase ist in Produktion erforderlich.");
    return { mode: "demo" as const, reservedWishIds: [...demoStore.keys()] };
  }
  return { mode: "live" as const, reservedWishIds: await getLiveReservationStatus(MATS_WISHLIST_ID) ?? [] };
}

export async function getPublicReservationStatus(wishlistId: string) {
  const reservedWishIds = await getLiveReservationStatus(wishlistId);
  if (reservedWishIds === null) throw new Error("Supabase ist nicht eingerichtet.");
  return { reservedWishIds };
}

export async function createMatsReservation(wishId: string, guestName: string, password: string, idempotencyKey: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (!demoModeIsAllowed()) return { unavailable: true as const };
    if (!fallbackMatsWishIds.has(wishId)) return { unavailable: true as const };
    if (demoStore.has(wishId)) return { conflict: true as const };
    const passwordSalt = randomBytes(16).toString("hex");
    demoStore.set(wishId, {
      wishId,
      guestName,
      passwordSalt,
      passwordHash: passwordDigest(password, passwordSalt).toString("hex"),
    });
    return { conflict: false as const, mode: "demo" as const };
  }
  const { error } = await supabase.rpc("reserve_mats_wish_v2", {
    p_wish_id: wishId,
    p_guest_name: guestName,
    p_password: password,
    p_idempotency_key: idempotencyKey,
  });
  if (error?.code === "23505") return { conflict: true as const };
  if (error?.code === "P0002") return { unavailable: true as const };
  if (error) throw new Error(error.message);
  return { conflict: false as const, mode: "live" as const };
}

export async function cancelMatsReservation(wishId: string, password: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (!demoModeIsAllowed()) return { unavailable: true as const };
    if (!fallbackMatsWishIds.has(wishId)) return { unavailable: true as const };
    const reservation = demoStore.get(wishId);
    if (!reservation || !passwordMatches(password, reservation)) return { cancelled: false, mode: "demo" as const };
    demoStore.delete(wishId);
    return { cancelled: true, mode: "demo" as const };
  }
  const { data, error } = await supabase.rpc("cancel_reservation", { p_wish_id: wishId, p_password: password });
  if (error?.code === "P0002") return { cancelled: false, mode: "live" as const };
  if (error) throw new Error(error.message);
  return { cancelled: Boolean(data), mode: "live" as const };
}

export async function createPublicReservation(wishlistId: string, wishId: string, guestName: string, password: string, idempotencyKey: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase ist nicht eingerichtet.");
  const { data, error } = await supabase.rpc("reserve_wish_v3", {
    p_wishlist_id: wishlistId,
    p_wish_id: wishId,
    p_guest_name: guestName,
    p_password: password,
    p_idempotency_key: idempotencyKey,
  });
  if (error?.code === "23505") return { conflict: true as const };
  if (error?.code === "P0002") return { unavailable: true as const };
  if (error) throw new Error(error.message);
  return { conflict: false as const, replayed: Boolean(data?.[0]?.replayed) };
}

export async function cancelPublicReservation(wishlistId: string, wishId: string, password: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase ist nicht eingerichtet.");
  const { data, error } = await supabase.rpc("cancel_reservation_v2", {
    p_wishlist_id: wishlistId,
    p_wish_id: wishId,
    p_password: password,
  });
  if (error?.code === "P0002") return { unavailable: true as const };
  if (error) throw new Error(error.message);
  return { cancelled: Boolean(data) };
}
