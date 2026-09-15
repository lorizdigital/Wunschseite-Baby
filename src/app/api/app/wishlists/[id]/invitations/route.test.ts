import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  membership: { data: { role: "owner" }, error: null } as { data: { role: string } | null; error: unknown },
  consumeRateLimit: vi.fn(),
  rpc: vi.fn(),
  sendInvitationEmail: vi.fn(),
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
    user: { id: "user-1", email: "owner@example.com" },
    supabase: {
      from: (table: string) => table === "wishlist_members"
        ? query(() => state.membership)
        : query(() => ({ data: { title: "Unsere Liste" }, error: null })),
      rpc: state.rpc,
    },
    json: (payload: unknown, init?: number) => Response.json(payload, { status: init ?? 200 }),
  }),
  privateJson: (payload: unknown, init?: number) => Response.json(payload, { status: init ?? 200 }),
}));
vi.mock("@/lib/brevo", () => ({ sendInvitationEmail: state.sendInvitationEmail }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: state.consumeRateLimit }));

import { POST } from "@/app/api/app/wishlists/[id]/invitations/route";

const wishlistId = "00000000-0000-4000-8000-000000000001";
const initialAppOrigin = process.env.APP_ORIGIN;

function invitationRequest() {
  return new NextRequest(`https://listen.example/api/app/wishlists/${wishlistId}/invitations`, {
    method: "POST",
    headers: { Origin: "https://listen.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Gast@Example.com", role: "viewer" }),
  });
}

beforeEach(() => {
  process.env.APP_ORIGIN = "https://listen.example";
  state.membership = { data: { role: "owner" }, error: null };
  state.consumeRateLimit.mockReset().mockResolvedValue(true);
  state.rpc.mockReset().mockResolvedValue({ data: [{ invitation_id: "invite-1" }], error: null });
  state.sendInvitationEmail.mockReset().mockResolvedValue("sent");
});

afterAll(() => {
  if (initialAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = initialAppOrigin;
});

describe("POST wishlist invitation", () => {
  it("rejects non-owners before consuming quotas or sending email", async () => {
    state.membership = { data: { role: "editor" }, error: null };

    const response = await POST(invitationRequest(), { params: Promise.resolve({ id: wishlistId }) });

    expect(response.status).toBe(404);
    expect(state.consumeRateLimit).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("rate-limits owners before creating or sending an invitation", async () => {
    state.consumeRateLimit.mockResolvedValueOnce(false);

    const response = await POST(invitationRequest(), { params: Promise.resolve({ id: wishlistId }) });

    expect(response.status).toBe(429);
    expect(state.consumeRateLimit).toHaveBeenCalledWith("wishlist-invitation-send", `user-1:${wishlistId}`, 10, 3600);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("limits repeated invitations to the same normalized recipient", async () => {
    state.consumeRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await POST(invitationRequest(), { params: Promise.resolve({ id: wishlistId }) });

    expect(response.status).toBe(429);
    expect(state.consumeRateLimit).toHaveBeenNthCalledWith(2, "wishlist-invitation-recipient", "user-1:gast@example.com", 3, 86400);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sendInvitationEmail).not.toHaveBeenCalled();
  });
});
