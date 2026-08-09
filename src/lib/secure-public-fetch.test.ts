import { describe, expect, it } from "vitest";
import { resolvePublicUrl } from "@/lib/secure-public-fetch";

describe("secure public fetch", () => {
  it("rejects loopback and private IP targets before a request is sent", async () => {
    await expect(resolvePublicUrl("http://127.0.0.1/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://192.168.1.4/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::1]/private")).rejects.toThrow();
  });

  it("rejects credentials and non-web schemes", async () => {
    await expect(resolvePublicUrl("https://user:password@example.com/product")).rejects.toThrow();
    await expect(resolvePublicUrl("file:///private/data")).rejects.toThrow();
  });
});
