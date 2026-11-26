const rateLimits = new Map();
const rateLimitWindowMs = 60_000;

export function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

export function isRateLimited(request, route) {
  const forwardedFor = request.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim();
  const key = `${route}:${clientIp || 'unknown'}`;
  const now = Date.now();
  const lastRequest = rateLimits.get(key);

  if (lastRequest && now - lastRequest < rateLimitWindowMs) return true;

  rateLimits.set(key, now);
  if (rateLimits.size > 1000) {
    for (const [entry, timestamp] of rateLimits) {
      if (now - timestamp >= rateLimitWindowMs) rateLimits.delete(entry);
    }
  }
  return false;
}

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
