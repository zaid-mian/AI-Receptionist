import { Request, Response, NextFunction } from "express";
import { verifyJwt, TokenPayload } from "../services/auth.js";
import { config } from "../config.js";

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/** Middleware: Requires a valid Bearer JWT token in the Authorization header */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Authentication required. Please log in." },
    });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyJwt(token, config.jwtSecret);
  if (!payload) {
    return res.status(401).json({
      error: { code: "invalid_token", message: "Session expired or invalid. Please log in again." },
    });
  }

  req.user = payload;
  next();
}

/** Middleware: Restricts access to specified roles (e.g. ['admin']) */
export function requireRole(allowedRoles: Array<"admin" | "staff">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "unauthorized", message: "Authentication required." },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "forbidden", message: "You do not have permission to access this resource." },
      });
    }

    next();
  };
}

/** Optional auth: Attaches user if valid token present, but does not block requests */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const payload = verifyJwt(token, config.jwtSecret);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}
