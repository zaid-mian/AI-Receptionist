import { Request, Response, NextFunction } from "express";

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

/**
 * Minimal in-memory fixed-window rate limiter.
 * Sufficient for a demo; replace with Redis in production.
 */
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({
        error: { code: "rate_limited", message: "Too many requests — please slow down and try again." },
      });
    }
    next();
  };
}
