import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccessFormToken, verifyAccessFormToken } from "@/lib/access-form-token";

const initialSecret = process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET;
const validSecret = "access-form-token-test-secret-with-at-least-32-characters";
const issuedAt = new Date("2026-08-09T12:00:00.000Z");

function requireToken(scope = "mats") {
  const token = createAccessFormToken(scope);
  expect(token).toEqual(expect.any(String));
  return token as string;
}

function tamper(token: string) {
  const index = [...token].findIndex((character) => character !== ".");
  expect(index).toBeGreaterThanOrEqual(0);
  const replacement = token[index] === "A" ? "B" : "A";
  return `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(issuedAt);
  process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET = validSecret;
});

afterEach(() => {
  vi.useRealTimers();
  if (initialSecret === undefined) delete process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET;
  else process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET = initialSecret;
});

describe("signed access-form tokens", () => {
  it("accepts a freshly created token for its scope", () => {
    const token = requireToken("mats");

    expect(verifyAccessFormToken(token, "mats")).toBe(true);
  });

  it("rejects a manipulated token", () => {
    const token = requireToken("mats");

    expect(verifyAccessFormToken(tamper(token), "mats")).toBe(false);
  });

  it("rejects a valid token for a different scope", () => {
    const token = requireToken("mats");

    expect(verifyAccessFormToken(token, "another_public_list_1234")).toBe(false);
  });

  it("rejects expired tokens and tokens issued too far in the future", () => {
    const token = requireToken("mats");

    vi.setSystemTime(new Date(issuedAt.getTime() + 366 * 24 * 60 * 60 * 1_000));
    expect(verifyAccessFormToken(token, "mats")).toBe(false);

    vi.setSystemTime(new Date(issuedAt.getTime() - 24 * 60 * 60 * 1_000));
    expect(verifyAccessFormToken(token, "mats")).toBe(false);
  });

  it("rejects missing, malformed, and non-string token values", () => {
    for (const token of [null, undefined, "", "not-a-token", ".", "..", {}, [], 123]) {
      expect(verifyAccessFormToken(token, "mats")).toBe(false);
    }
  });

  it("fails closed when the session secret is missing or too short", () => {
    const token = requireToken("mats");

    delete process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET;
    expect(createAccessFormToken("mats")).toBeNull();
    expect(verifyAccessFormToken(token, "mats")).toBe(false);

    process.env.PUBLIC_WISHLIST_ACCESS_SESSION_SECRET = "too-short";
    expect(createAccessFormToken("mats")).toBeNull();
    expect(verifyAccessFormToken(token, "mats")).toBe(false);
  });
});
