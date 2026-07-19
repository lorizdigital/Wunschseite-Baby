import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type DemoReservation = { wishId: string; guestName: string; passwordSalt: string; passwordHash: string };
declare global { var __matsReservations: Map<string, DemoReservation> | undefined; }
const demoStore = globalThis.__matsReservations ?? new Map<string, DemoReservation>();
globalThis.__matsReservations = demoStore;
for (const [wishId, reservation] of demoStore) {
  if (!reservation.passwordHash || !reservation.passwordSalt) demoStore.delete(wishId);
}

function passwordDigest(password: string, salt: string) {
  return scryptSync(password, salt, 32);
}

function passwordMatches(password: string, reservation: DemoReservation) {
  if (!reservation.passwordHash || !reservation.passwordSalt) return false;
  const actual = passwordDigest(password, reservation.passwordSalt);
  const expected = Buffer.from(reservation.passwordHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function getReservationStatus() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { mode: "demo" as const, reservedWishIds: [...demoStore.keys()] };
  const { data, error } = await supabase.from("reservations").select("wish_id").is("cancelled_at", null);
  if (error) throw new Error(error.message);
  return { mode: "live" as const, reservedWishIds: (data ?? []).map((row) => row.wish_id as string) };
}

export async function createReservation(wishId: string, guestName: string, password: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
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
  const { error } = await supabase.rpc("reserve_wish", {
    p_wish_id: wishId,
    p_guest_name: guestName,
    p_password: password,
  });
  if (error?.code === "23505") return { conflict: true as const };
  if (error) throw new Error(error.message);
  return { conflict: false as const, mode: "live" as const };
}

export async function cancelReservation(wishId: string, password: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const reservation = demoStore.get(wishId);
    if (!reservation || !passwordMatches(password, reservation)) return { cancelled: false, mode: "demo" as const };
    demoStore.delete(wishId);
    return { cancelled: true, mode: "demo" as const };
  }
  const { data, error } = await supabase.rpc("cancel_reservation", { p_wish_id: wishId, p_password: password });
  if (error) throw new Error(error.message);
  return { cancelled: Boolean(data), mode: "live" as const };
}
