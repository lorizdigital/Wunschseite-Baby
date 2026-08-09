import { describe, expect, it } from "vitest";
import { getSafeAuthNext } from "@/lib/supabase-user";

describe("post-login return paths", () => {
  it("allows only the application dashboard and a well-formed invitation link", () => {
    expect(getSafeAuthNext("/app")).toBe("/app");
    expect(getSafeAuthNext(`/einladung/${"a".repeat(32)}`)).toBe(`/einladung/${"a".repeat(32)}`);
  });

  it("fails closed for arbitrary, malformed, and external return values", () => {
    expect(getSafeAuthNext("https://attacker.example")).toBe("/app");
    expect(getSafeAuthNext("//attacker.example")).toBe("/app");
    expect(getSafeAuthNext("/einladung/short")).toBe("/app");
  });
});
