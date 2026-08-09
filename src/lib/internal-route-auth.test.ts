import { afterEach, describe, expect, it } from "vitest";
import { isInternalRequestAuthorized } from "@/lib/internal-route-auth";

const initialSecret = process.env.INTERNAL_CRON_SECRET;
const initialProvisioningSecret = process.env.INTERNAL_PROVISIONING_SECRET;

afterEach(() => {
  if (initialSecret === undefined) delete process.env.INTERNAL_CRON_SECRET;
  else process.env.INTERNAL_CRON_SECRET = initialSecret;
  if (initialProvisioningSecret === undefined) delete process.env.INTERNAL_PROVISIONING_SECRET;
  else process.env.INTERNAL_PROVISIONING_SECRET = initialProvisioningSecret;
});

describe("internal scheduler and monitoring authorization", () => {
  it("accepts only the configured bearer secret", () => {
    process.env.INTERNAL_CRON_SECRET = "a-test-secret";
    expect(isInternalRequestAuthorized(new Request("https://listen.example/api/internal/health", {
      headers: { Authorization: "Bearer a-test-secret" },
    }))).toBe(true);
    expect(isInternalRequestAuthorized(new Request("https://listen.example/api/internal/health", {
      headers: { Authorization: "Bearer another-secret" },
    }))).toBe(false);
  });

  it("fails closed when no secret is configured or sent", () => {
    delete process.env.INTERNAL_CRON_SECRET;
    expect(isInternalRequestAuthorized(new Request("https://listen.example/api/internal/health"))).toBe(false);
  });

  it("keeps provisioning and scheduler credentials separate", () => {
    process.env.INTERNAL_CRON_SECRET = "cron-secret";
    process.env.INTERNAL_PROVISIONING_SECRET = "provisioning-secret";
    const provisioningRequest = new Request("https://listen.example/api/internal/provision-wishlist", {
      headers: { Authorization: "Bearer provisioning-secret" },
    });
    expect(isInternalRequestAuthorized(provisioningRequest, "INTERNAL_PROVISIONING_SECRET")).toBe(true);
    expect(isInternalRequestAuthorized(provisioningRequest)).toBe(false);
  });
});
