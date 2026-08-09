import { describe, expect, it } from "vitest";
import { normalizeProductUrl } from "@/lib/product-url";

describe("normalizeProductUrl", () => {
  it("removes common tracking data without changing the product destination", () => {
    expect(normalizeProductUrl("https://shop.example/kinderwagen?utm_source=family&variant=blue&fbclid=abc#details"))
      .toBe("https://shop.example/kinderwagen?variant=blue");
  });

  it("reduces Amazon product URLs to a stable canonical link", () => {
    expect(normalizeProductUrl("https://www.amazon.de/gp/product/B0ABC12345?tag=family-21"))
      .toBe("https://www.amazon.de/dp/B0ABC12345");
  });

  it("unwraps supported redirect URLs before normalising them", () => {
    expect(normalizeProductUrl("https://www.google.com/url?url=https%3A%2F%2Fshop.example%2Fitem%3Futm_source%3Dtest%26size%3DM"))
      .toBe("https://shop.example/item?size=M");
  });

  it("rejects credentials and non-web protocols", () => {
    expect(() => normalizeProductUrl("https://name:secret@shop.example/item")).toThrow();
    expect(() => normalizeProductUrl("file:///private/data.txt")).toThrow();
  });
});
