import { afterEach, describe, expect, it } from "vitest";
import { isJsonRequest, isSameAppOrigin, isSameRequestOrigin } from "@/lib/request-security";

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

  it("accepts the normalized request origin when APP_ORIGIN points to a different Cloudflare origin", () => {
    process.env.APP_ORIGIN = "https://wuenschi-worker.example.workers.dev";
    const request = new Request("https://xn--wnschi-3ya.de/api/admin/mats-access-code", {
      method: "POST",
      headers: { Origin: "https://XN--WNSCHI-3YA.DE:443", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    });

    expect(isSameRequestOrigin(request)).toBe(true);
  });

  it("rejects an external origin even when a browser header is forged", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/api/app/wishlists", {
      method: "POST",
      headers: { Origin: "https://other.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    });
    expect(isSameAppOrigin(request)).toBe(false);
  });

  it("rejects an external origin even when APP_ORIGIN is misconfigured to that origin", () => {
    process.env.APP_ORIGIN = "https://attacker.example";
    const request = new Request("https://xn--wnschi-3ya.de/api/admin/mats-access-code", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    });

    expect(isSameRequestOrigin(request)).toBe(false);
  });

  it("rejects a POST request without an Origin header", () => {
    process.env.APP_ORIGIN = "https://wuenschi-worker.example.workers.dev";
    const request = new Request("https://xn--wnschi-3ya.de/api/admin/mats-access-code", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    });

    expect(isSameRequestOrigin(request)).toBe(false);
  });

  it("requires JSON for state-changing application endpoints", () => {
    process.env.APP_ORIGIN = "https://listen.example";
    const request = new Request("https://listen.example/api/app/wishlists", {
      method: "POST",
      headers: { Origin: "https://listen.example", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(isJsonRequest(request)).toBe(false);
  });
});
