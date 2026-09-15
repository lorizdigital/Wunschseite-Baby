import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  wishRows: [] as Record<string, unknown>[],
  reservationRows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  MATS_WISHLIST_ID: "3d1f46e6-8e0e-4418-a0da-581be7cf795f",
  getSupabaseAdmin: () => ({
    from: (table: string) => table === "wishes"
      ? { select: () => ({ eq: () => ({ order: async () => ({ data: state.wishRows, error: null }) }) }) }
      : { select: () => ({ is: async () => ({ data: state.reservationRows, error: null }) }) },
  }),
}));

import { GET } from "@/app/api/admin/wishes/route";
import type { AdminWish } from "@/lib/admin-types";

const reservedWishId = "00000000-0000-4000-8000-000000000001";
const freeWishId = "00000000-0000-4000-8000-000000000002";
const originalEnvironment = {
  ADMIN_IMPORT_SECRET: process.env.ADMIN_IMPORT_SECRET,
  LEGACY_MATS_ADMIN_ENABLED: process.env.LEGACY_MATS_ADMIN_ENABLED,
};

function wishRow(id: string, title: string) {
  return { id, title, description: null, product_url: "https://shop.example/artikel", image_url: null, price_amount: "19.90", currency: "EUR", shop_name: "Shop", sort_order: 10, archived_at: null };
}

beforeEach(() => {
  process.env.ADMIN_IMPORT_SECRET = "admin-test-secret";
  process.env.LEGACY_MATS_ADMIN_ENABLED = "true";
  state.wishRows = [wishRow(reservedWishId, "Bausteine"), wishRow(freeWishId, "Bilderbuch")];
  state.reservationRows = [{ wish_id: reservedWishId, guest_name: "Oma Renate", reserved_at: "2026-09-01T10:00:00.000Z" }];
});

afterEach(() => {
  for (const name of Object.keys(originalEnvironment) as (keyof typeof originalEnvironment)[]) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("GET /api/admin/wishes", () => {
  it("names the guest behind every open reservation so the release can be verified", async () => {
    const response = await GET(new Request("https://xn--wnschi-3ya.de/api/admin/wishes", { headers: { "x-admin-secret": "admin-test-secret" } }));

    expect(response.status).toBe(200);
    const { wishes } = await response.json() as { wishes: AdminWish[] };
    expect(wishes.map((wish) => [wish.id, wish.reserved, wish.reservedBy, wish.reservedAt])).toEqual([
      [reservedWishId, true, "Oma Renate", "2026-09-01T10:00:00.000Z"],
      [freeWishId, false, null, null],
    ]);
  });
});
