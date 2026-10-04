import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { httpError } from "../utils/httpError.js";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

// Stored format: scrypt$N$r$p$<salt b64>$<hash b64>, so parameters can be raised later.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }
  if (password.length > 128) throw httpError(400, "Password must be at most 128 characters");
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw httpError(400, "Password must contain at least one letter and one number");
  }
}
