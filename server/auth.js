import crypto from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD || 'sessionops';
const SECRET = process.env.APP_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'so_session';
const TTL_MS = 1000 * 60 * 60 * 12;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.APP_PASSWORD) {
  console.warn('[auth] APP_PASSWORD is not set. Using the development password "sessionops".');
}
if (!process.env.APP_SESSION_SECRET) {
  console.warn('[auth] APP_SESSION_SECRET is not set. Sessions will reset when the server restarts.');
}

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function checkPassword(input) {
  return safeEqual(input ?? '', PASSWORD);
}

export function rateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

export function clearRateLimit(ip) {
  attempts.delete(ip);
}

export function issueCookie(res) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: TTL_MS,
    path: '/'
  });
}

export function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function readToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=');
  }
  return '';
}

export function isAuthenticated(req) {
  const token = readToken(req);
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Authentication required' });
}
