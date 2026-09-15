import { describe, expect, it } from "vitest";
import { parseProductHtml } from "@/lib/product-scraper";

describe("product metadata extraction", () => {
  it("reads a schema.org ImageObject and resolves relative URLs", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Babydecke","image":{"@type":"ImageObject","contentUrl":"/images/decke.webp"}}</script>`;
    const product = parseProductHtml(html, new URL("https://shop.example/products/decke"));
    expect(product.title).toBe("Babydecke");
    expect(product.imageUrl).toBe("https://shop.example/images/decke.webp");
  });

  it("uses twitter:image when schema.org and Open Graph have no image", () => {
    const html = `<html><head><meta name="twitter:image" content="https://cdn.example/bett.png"><meta property="og:title" content="Babybett"></head></html>`;
    expect(parseProductHtml(html, new URL("https://shop.example/bett")).imageUrl).toBe("https://cdn.example/bett.png");
  });

  it("still returns product data when no image exists", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Spieluhr","offers":{"price":"19.95","priceCurrency":"EUR"}}</script>`;
    const product = parseProductHtml(html, new URL("https://shop.example/spieluhr"));
    expect(product).toMatchObject({ title: "Spieluhr", imageUrl: null, price: "19.95", currency: "EUR" });
  });

  it("reads schema.org microdata from classic shop pages", () => {
    const product = parseProductHtml(`
      <nav><span itemprop="name">Navigation</span></nav>
      <div itemscope itemtype="https://schema.org/Product">
        <img itemprop="image" src="/produkte/kinderwagen.jpg" alt="Kinderwagen">
        <h1 itemprop="name">Kinderwagen Uno</h1>
        <p itemprop="description">Leicht und kompakt.</p>
        <span itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <span itemprop="price">249.90</span>
          <meta itemprop="priceCurrency" content="EUR">
        </span>
      </div>
    `, new URL("https://shop.example/produkte/uno"));

    expect(product).toMatchObject({
      title: "Kinderwagen Uno",
      description: "Leicht und kompakt.",
      imageUrl: "https://shop.example/produkte/kinderwagen.jpg",
      price: "249.90",
      currency: "EUR",
    });
  });
});
