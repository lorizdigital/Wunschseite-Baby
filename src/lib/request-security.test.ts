import { afterEach, describe, expect, it } from "vitest";
import { isJsonRequest, isSameAppOrigin } from "@/lib/request-security";

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
});
