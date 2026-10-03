import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  TokenPayload,
} from "../services/auth.js";
import { requireRole } from "../middleware/auth.js";

const TEST_SECRET = "super-secret-jwt-signing-key-for-tests-123456";

describe("Auth Service (scrypt + HMAC-SHA256 JWT)", () => {
  it("hashes password with unique salt and verifies correctly", () => {
    const password = "HospitalSecret2026!";
    const { hash, salt } = hashPassword(password);

    assert.ok(hash && hash.length === 128, "Hash should be 128-char hex string (64 bytes)");
    assert.ok(salt && salt.length === 32, "Salt should be 32-char hex string (16 bytes)");

    const valid = verifyPassword(password, hash, salt);
    assert.equal(valid, true, "Valid password should verify as true");

    const wrong = verifyPassword("WrongPassword123", hash, salt);
    assert.equal(wrong, false, "Wrong password should verify as false");
  });

  it("generates different salts for identical passwords", () => {
    const p = "SamePassword123";
    const a = hashPassword(p);
    const b = hashPassword(p);

    assert.notEqual(a.salt, b.salt, "Salts must be randomly generated and unique");
    assert.notEqual(a.hash, b.hash, "Hashes with different salts must differ");
  });

  it("signs and verifies JWT payloads with tamper protection", () => {
    const payload: TokenPayload = {
      userId: "usr_test123",
      email: "test.doctor@faisalhospital.pk",
      name: "Dr. Test Specialist",
      role: "staff",
    };

    const token = signJwt(payload, TEST_SECRET, 3600);
    assert.ok(token && token.split(".").length === 3, "JWT must have 3 dot-separated parts");

    const verified = verifyJwt(token, TEST_SECRET);
    assert.ok(verified, "Token should verify successfully");
    assert.equal(verified?.userId, payload.userId);
    assert.equal(verified?.email, payload.email);
    assert.equal(verified?.role, payload.role);

    // Tampered payload test
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const tamperedResult = verifyJwt(tamperedToken, TEST_SECRET);
    assert.equal(tamperedResult, null, "Tampered JWT signature must be rejected");
  });

  it("rejects expired tokens", () => {
    const payload: TokenPayload = {
      userId: "usr_exp",
      email: "exp@faisalhospital.pk",
      name: "Expired",
      role: "staff",
    };
    // Token that expired 10 seconds ago
    const token = signJwt(payload, TEST_SECRET, -10);

    const verified = verifyJwt(token, TEST_SECRET);
    assert.equal(verified, null, "Expired token must return null");
  });

  it("enforces RBAC permissions via requireRole middleware", () => {
    const adminOnly = requireRole(["admin"]);

    // Test 1: Admin user allowed
    let nextCalled = false;
    const reqAdmin = {
      user: { userId: "u1", email: "admin@faisalhospital.pk", role: "admin", name: "Admin" },
    } as any;
    const res = {
      status: (code: number) => ({
        json: (data: any) => ({ code, data }),
      }),
    } as any;
    adminOnly(reqAdmin, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, "Admin should be permitted through adminOnly middleware");

    // Test 2: Staff user forbidden (403)
    let statusCode = 0;
    let errorData: any = null;
    const reqStaff = {
      user: { userId: "u2", email: "reception@faisalhospital.pk", role: "staff", name: "Receptionist" },
    } as any;
    const resForbidden = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            errorData = data;
          },
        };
      },
    } as any;
    adminOnly(reqStaff, resForbidden, () => {
      assert.fail("Staff should not reach next() on admin-only route");
    });
    assert.equal(statusCode, 403, "Staff access to admin route must return 403 Forbidden");
    assert.equal(errorData?.error?.code, "forbidden");

    // Test 3: Unauthenticated user unauthorized (401)
    let unauthCode = 0;
    const reqUnauth = {} as any;
    const resUnauth = {
      status: (code: number) => {
        unauthCode = code;
        return { json: () => {} };
      },
    } as any;
    adminOnly(reqUnauth, resUnauth, () => {
      assert.fail("Unauthenticated should not reach next()");
    });
    assert.equal(unauthCode, 401, "Unauthenticated request must return 401 Unauthorized");
  });
});
