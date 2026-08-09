export const ACCESS_CODE_MIN_LENGTH = 8;
export const ACCESS_CODE_MAX_LENGTH = 64;

export type AccessCodeValidation = {
  valid: boolean;
  message: string;
  kind: "hint" | "error" | "success";
};

export function validateAccessCode(value: string): AccessCodeValidation {
  const normalized = value.trim();
  const length = normalized.length;

  if (value.length === 0) {
    return { valid: false, message: `${ACCESS_CODE_MIN_LENGTH} bis ${ACCESS_CODE_MAX_LENGTH} Zeichen.`, kind: "hint" };
  }
  if (length < ACCESS_CODE_MIN_LENGTH) {
    const missing = ACCESS_CODE_MIN_LENGTH - length;
    return { valid: false, message: `Noch ${missing} Zeichen erforderlich.`, kind: "error" };
  }
  if (length > ACCESS_CODE_MAX_LENGTH) {
    return { valid: false, message: `Der Code ist ${length - ACCESS_CODE_MAX_LENGTH} Zeichen zu lang.`, kind: "error" };
  }
  if (value !== normalized) {
    return { valid: true, message: "Gültig. Leerzeichen am Anfang oder Ende werden entfernt.", kind: "success" };
  }
  return { valid: true, message: "Der Code erfüllt alle Anforderungen.", kind: "success" };
}
