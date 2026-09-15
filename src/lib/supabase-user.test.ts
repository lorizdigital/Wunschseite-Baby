import { describe, expect, it } from "vitest";
import { getAuthCallbackUrl, getMagicLinkConfirmUrl, getSafeAuthNext } from "@/lib/supabase-user";

describe("post-login return paths", () => {
  it("allows only the application dashboard, first-list setup, and a well-formed invitation link", () => {
    expect(getSafeAuthNext("/app")).toBe("/app");
    expect(getSafeAuthNext("/neu")).toBe("/neu");
    expect(getSafeAuthNext(`/einladung/${"a".repeat(32)}`)).toBe(`/einladung/${"a".repeat(32)}`);
  });

  it("fails closed for arbitrary, malformed, and external return values", () => {
    expect(getSafeAuthNext("https://attacker.example")).toBe("/app");
    expect(getSafeAuthNext("//attacker.example")).toBe("/app");
    expect(getSafeAuthNext("/einladung/short")).toBe("/app");
  });

  it("uses the exact configured callback URL for the normal dashboard login", () => {
    expect(getAuthCallbackUrl("/app")).toBe("http://localhost:3000/auth/callback");
    expect(getAuthCallbackUrl("/neu")).toBe("http://localhost:3000/auth/callback?next=%2Fneu");
  });

  it("builds an app-owned magic-link confirmation URL", () => {
    expect(getMagicLinkConfirmUrl("hashed-token", "/app")).toBe(
      "http://localhost:3000/auth/callback?token_hash=hashed-token&type=magiclink",
    );
    expect(getMagicLinkConfirmUrl("hashed-token", "/neu")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fneu&token_hash=hashed-token&type=magiclink",
    );
  });
});
