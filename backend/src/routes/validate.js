import { httpError } from "../utils/httpError.js";

export function requireString(body, field) {
  const value = body?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(400, `'${field}' is required and must be a non-empty string`);
  }
  return value.trim();
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}
