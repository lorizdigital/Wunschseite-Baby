import { afterEach, describe, expect, it } from "vitest";
import { isJsonRequest, isSameAppFormSubmission, isSameAppOrigin } from "@/lib/request-security";

const initialOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (initialOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = initialOrigin;
});

describe("cookie mutation request checks", () => {
  it("accepts a same-origin JSON request", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/api/app/wishlists", {
      method: "POST",
      headers: { Origin: "https://listen.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json; charset=utf-8" },
    });
    expect(isSameAppOrigin(request)).toBe(true);
    expect(isJsonRequest(request)).toBe(true);
  });

  it("rejects an external origin even when a browser header is forged", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/api/app/wishlists", {
      method: "POST",
      headers: { Origin: "https://other.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    });
    expect(isSameAppOrigin(request)).toBe(false);
  });

  it("requires JSON for state-changing application endpoints", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/api/app/wishlists", {
      method: "POST",
      headers: { Origin: "https://listen.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(isJsonRequest(request)).toBe(false);
  });

  it("accepts a same-origin form submission when no-referrer suppresses Origin and Referer", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/auth/logout", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(isSameAppFormSubmission(request)).toBe(true);
  });

  it("rejects cross-site form submissions even with a matching Referer", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/auth/logout", {
      method: "POST",
      headers: { Referer: "https://listen.example/app", "Sec-Fetch-Site": "cross-site" },
    });
    expect(isSameAppFormSubmission(request)).toBe(false);
  });

  it("accepts a stale same-origin logout on the explicit www alias", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://www.listen.example/auth/logout", {
      method: "POST",
      headers: { Origin: "https://www.listen.example", "Sec-Fetch-Site": "same-origin" },
    });
    expect(isSameAppFormSubmission(request)).toBe(true);
  });

  it("rejects same-site form posts to an untrusted host", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://worker.example.dev/auth/logout", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(isSameAppFormSubmission(request)).toBe(false);
  });

  it("rejects form submissions without verifiable browser context", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/auth/logout", { method: "POST" });
    expect(isSameAppFormSubmission(request)).toBe(false);
  });

  it("rejects a known target when the form origin is unverifiable", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    expect(isSameAppFormSubmission(new Request("https://listen.example/auth/logout", {
      method: "POST",
      headers: { Origin: "null", "Sec-Fetch-Site": "same-origin" },
    }))).toBe(false);
  });

  it("does not allow logout handling on an unrelated worker host", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    expect(isSameAppFormSubmission(new Request("https://worker.example.dev/auth/logout", {
      method: "POST",
      headers: { Origin: "https://worker.example.dev", "Sec-Fetch-Site": "same-origin" },
    }))).toBe(false);
  });
});
