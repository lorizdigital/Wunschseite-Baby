import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  membership: { data: { role: "owner" }, error: null } as { data: { role: string } | null; error: unknown },
  rpc: vi.fn(),
  consumeRateLimit: vi.fn(),
  requiresDownload: vi.fn(),
  storeProductImage: vi.fn(),
  removeStoredProductImage: vi.fn(),
}));

function query(result: () => unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result(),
  };
  return chain;
}

vi.mock("@/lib/app-route-auth", () => ({
  getAuthenticatedRoute: async () => ({
    user: { id: "user-1", email: "familie@example.com" },
    supabase: {
      from: () => query(() => state.membership),
      rpc: state.rpc,
    },
    json: (payload: unknown, init?: number) => Response.json(payload, { status: init ?? 200 }),
  }),
  privateJson: (payload: unknown, init?: number) => Response.json(payload, { status: init ?? 200 }),
}));
vi.mock("@/lib/product-image-storage", () => ({
  requiresProductImageDownload: state.requiresDownload,
  storeProductImage: state.storeProductImage,
  removeStoredProductImage: state.removeStoredProductImage,
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: state.consumeRateLimit }));

import { POST } from "@/app/api/app/wishlists/[id]/wishes/route";

const wishlistId = "00000000-0000-4000-8000-000000000001";
const initialAppOrigin = process.env.APP_ORIGIN;

function postRequest() {
  return new NextRequest(`https://listen.example/api/app/wishlists/${wishlistId}/wishes`, {
    method: "POST",
    headers: { Origin: "https://listen.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Kinderwagen", imageUrl: "https://images.example/new.jpg" }),
  });
}

beforeEach(() => {
  process.env.APP_ORIGIN = "https://listen.example";
  state.membership = { data: { role: "owner" }, error: null };
  state.rpc.mockReset().mockResolvedValue({ data: [{ id: "wish-1" }], error: null });
  state.consumeRateLimit.mockReset().mockResolvedValue(true);
  state.requiresDownload.mockReset().mockReturnValue(true);
  state.storeProductImage.mockReset().mockResolvedValue({ url: "https://storage.example/new.jpg", path: `${wishlistId}/new.jpg` });
  state.removeStoredProductImage.mockReset().mockResolvedValue(undefined);
});

afterAll(() => {
  if (initialAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = initialAppOrigin;
});

describe("POST wishlist wish", () => {
  it("rejects viewers before any image, rate-limit or storage side effect", async () => {
    state.membership = { data: { role: "viewer" }, error: null };

    const response = await POST(postRequest(), { params: Promise.resolve({ id: wishlistId }) });

    expect(response.status).toBe(404);
    expect(state.requiresDownload).not.toHaveBeenCalled();
    expect(state.consumeRateLimit).not.toHaveBeenCalled();
    expect(state.storeProductImage).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rate-limits an authorized external image before downloading it", async () => {
    state.consumeRateLimit.mockResolvedValue(false);

    const response = await POST(postRequest(), { params: Promise.resolve({ id: wishlistId }) });

    expect(response.status).toBe(429);
    expect(state.consumeRateLimit).toHaveBeenCalledWith("product-image-fetch", "user-1", 30, 3600);
    expect(state.storeProductImage).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
