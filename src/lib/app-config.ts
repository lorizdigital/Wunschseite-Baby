const localOrigin = "http://localhost:3000";

export function getAppOrigin() {
  const configured = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? localOrigin;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
    return url.origin;
  } catch {
    return localOrigin;
  }
}

export function usesSecureCookies() {
  return new URL(getAppOrigin()).protocol === "https:";
}

export function isFeatureEnabled(name: "MULTI_WISHLIST_ENABLED" | "SELF_SERVICE_SIGNUP_ENABLED" | "PUBLICATION_ENABLED" | "PRODUCT_IMPORT_ENABLED" | "LEGACY_MATS_ADMIN_ENABLED") {
  return process.env[name] === "true";
}

/** Legacy Mats administration stays available during the staged migration unless explicitly disabled. */
export function isLegacyMatsAdminEnabled() {
  return process.env.LEGACY_MATS_ADMIN_ENABLED !== "false";
}
