import { describe, expect, it } from "vitest";
import { validateAccessCode } from "@/lib/access-code";

describe("access-code validation", () => {
  it("reports the missing characters while typing", () => {
    expect(validateAccessCode("Mats")).toEqual({ valid: false, message: "Noch 4 Zeichen erforderlich.", kind: "error" });
  });

  it("accepts codes between 8 and 64 trimmed characters", () => {
    expect(validateAccessCode("Mats-2026").valid).toBe(true);
    expect(validateAccessCode(` ${"a".repeat(64)} `).valid).toBe(true);
  });

  it("rejects whitespace-only and overly long codes", () => {
    expect(validateAccessCode("        ").valid).toBe(false);
    expect(validateAccessCode("a".repeat(65)).valid).toBe(false);
  });
});
