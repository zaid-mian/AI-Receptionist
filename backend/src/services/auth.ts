import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

export interface TokenPayload {
  userId: string;
  email: string;
  role: "admin" | "staff";
  name: string;
  exp?: number;
  iat?: number;
}

/** Hash a password using Node.js scrypt with a random 16-byte salt */
export function hashPassword(password: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex || randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/** Verify a password against an existing scrypt hash and salt */
export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  try {
    const candidateHash = scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(candidateHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/** Sign a JWT token using HMAC-SHA256 (RFC 7519) */
export function signJwt(payload: TokenPayload, secret: string, expiresInSec: number = 86400 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${signature}`;
}

/** Verify a JWT token and return the validated payload */
export function verifyJwt(token: string, secret: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expectedSig = createHmac("sha256", secret)
      .update(signingInput)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const a = Buffer.from(signatureB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as TokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired token
    }

    return payload;
  } catch {
    return null;
  }
}
