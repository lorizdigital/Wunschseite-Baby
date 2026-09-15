import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  MATS_WISHLIST_ID: "3d1f46e6-8e0e-4418-a0da-581be7cf795f",
  getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));

import { DELETE } from "@/app/api/admin/wishes/[id]/reservation/route";

const wishId = "00000000-0000-4000-8000-000000000001";
const originalEnvironment = {
  ADMIN_IMPORT_SECRET: process.env.ADMIN_IMPORT_SECRET,
  LEGACY_MATS_ADMIN_ENABLED: process.env.LEGACY_MATS_ADMIN_ENABLED,
};

function deleteRequest(secret: string | null = "admin-test-secret") {
  return new Request(`https://xn--wnschi-3ya.de/api/admin/wishes/${wishId}/reservation`, {
    method: "DELETE",
    headers: secret === null ? {} : { "x-admin-secret": secret },
  });
}

function params(id = wishId) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  process.env.ADMIN_IMPORT_SECRET = "admin-test-secret";
  process.env.LEGACY_MATS_ADMIN_ENABLED = "true";
  state.rpc.mockReset();
});

afterEach(() => {
  for (const name of Object.keys(originalEnvironment) as (keyof typeof originalEnvironment)[]) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("DELETE /api/admin/wishes/[id]/reservation", () => {
  it("releases the open reservation without asking for the guest password", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ released: true });
    expect(state.rpc).toHaveBeenCalledWith("admin_release_mats_reservation_v1", { p_wish_id: wishId });
  });

  it("reports an already free wish instead of pretending to release one", async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ released: false });
  });

  it("answers with 404 when the wish does not belong to the Mats list", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "wish_not_available" } });

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(404);
  });

  it("refuses a wrong or missing admin code before touching the database", async () => {
    await expect(DELETE(deleteRequest(null), params()).then((response) => response.status)).resolves.toBe(401);
    await expect(DELETE(deleteRequest("wrong-secret"), params()).then((response) => response.status)).resolves.toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses to run while the legacy Mats administration is switched off", async () => {
    process.env.LEGACY_MATS_ADMIN_ENABLED = "false";

    const response = await DELETE(deleteRequest(), params());

    expect(response.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
