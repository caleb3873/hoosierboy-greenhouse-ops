// api/_auth.js
// Shared auth helper for serverless functions
// Verifies the request has a valid Supabase JWT

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// In-memory rate limiter (resets on cold start - basic but effective for abuse)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // max 30 requests per minute per IP
const requestCounts = new Map();

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || "unknown";
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count++;
  requestCounts.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

async function verifySupabaseToken(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.id ? data : null;
  } catch {
    return null;
  }
}

// Middleware-style helper. Returns { user, error } — call from each API handler.
async function requireAuth(req, res) {
  // Rate limit check
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
    return null;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const user = await verifySupabaseToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  return user;
}

module.exports = { requireAuth, checkRateLimit, verifySupabaseToken };
