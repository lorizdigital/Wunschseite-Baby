import { describe, expect, it } from "vitest";
import { resolvePublicUrl } from "@/lib/secure-public-fetch";

describe("secure public fetch", () => {
  it("rejects loopback and private IP targets before a request is sent", async () => {
    await expect(resolvePublicUrl("http://127.0.0.1/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://192.168.1.4/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::1]/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::ffff:7f00:1]/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::ffff:a9fe:1]/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::ffff:a00:1]/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::192.168.1.1]/private")).rejects.toThrow();
    await expect(resolvePublicUrl("http://[::c0a8:101]/private")).rejects.toThrow();
  });

  it("does not classify ordinary public IPv6 or public IPv4-compatible addresses as private", async () => {
    await expect(resolvePublicUrl("http://[2001:4860:4860::8888]/public")).resolves.toMatchObject({
      target: { address: "2001:4860:4860::8888", family: 6 },
    });
    await expect(resolvePublicUrl("http://[::8.8.8.8]/public")).resolves.toMatchObject({
      target: { address: "::808:808", family: 6 },
    });
  });

  it("rejects credentials and non-web schemes", async () => {
    await expect(resolvePublicUrl("https://user:password@example.com/product")).rejects.toThrow();
    await expect(resolvePublicUrl("file:///private/data")).rejects.toThrow();
  });
});
