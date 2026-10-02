import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { config } from "../config.js";
import { verifyPassword, signJwt } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/v1/auth/login — Authenticate clinic staff/admin */
authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "invalid_input", message: "Please provide a valid email and password." },
    });
  }

  const { email, password } = parsed.data;
  const db = getDb();

  const user = db.prepare(
    `SELECT id, email, password_hash, salt, name, role FROM users WHERE lower(email) = lower(?)`
  ).get(email.trim()) as
    | { id: string; email: string; password_hash: string; salt: string; name: string; role: "admin" | "staff" }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    return res.status(401).json({
      error: { code: "invalid_credentials", message: "Invalid email or password." },
    });
  }

  const token = signJwt(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    config.jwtSecret,
    86400 * 7 // 7 days session
  );

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

/** GET /api/v1/auth/me — Return current authenticated staff/admin profile */
authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({
    user: req.user,
  });
});
