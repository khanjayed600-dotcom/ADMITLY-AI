import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db';
import type { UserRole } from '../src/types';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthenticatedStudent {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: 'student';
}

export interface AdminRequest extends Request {
  adminUser?: AuthenticatedAdmin;
}

export interface StudentRequest extends Request {
  studentUser?: AuthenticatedStudent;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const REMEMBER_ME_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const STUDENT_SESSION_COOKIE = 'admitly_student_session';
const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16
    ? configured
    : RUNTIME_FALLBACK_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function verifyHashTimingSafe(rawValue: string, expectedSha256Hex: string): boolean {
  const providedHex = hashResetToken(rawValue);
  const a = Buffer.from(providedHex, 'hex');
  const b = Buffer.from(expectedSha256Hex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createResetToken(): { rawToken: string; tokenHash: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(24).toString('base64url');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return { rawToken, tokenHash, expiresAt };
}

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  scope: 'admin' | 'student';
  iat: number;
  exp: number;
}

function signToken(payload: {
  id: string;
  email: string;
  role: UserRole;
  scope: 'admin' | 'student';
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const body: TokenPayload = {
    sub: payload.id,
    email: payload.email,
    role: payload.role,
    scope: payload.scope,
    iat: now,
    exp: now + (payload.ttlSeconds ?? TOKEN_TTL_SECONDS),
  };
  const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedBody)
    .digest('base64url');
  return `${encodedBody}.${sig}`;
}

function verifyToken(token: string, expectedScope: 'admin' | 'student'): TokenPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encodedBody = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!encodedBody || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedBody)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedBody, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (!parsed.sub || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (parsed.scope !== expectedScope) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function signAdminToken(payload: {
  id: string;
  email: string;
  role: UserRole;
}): string {
  return signToken({ ...payload, scope: 'admin', ttlSeconds: TOKEN_TTL_SECONDS });
}

export function verifyAdminToken(token: string): TokenPayload | null {
  return verifyToken(token, 'admin');
}

export function signStudentToken(payload: {
  id: string;
  email: string;
  rememberMe?: boolean;
}): string {
  return signToken({
    id: payload.id,
    email: payload.email,
    role: 'student',
    scope: 'student',
    ttlSeconds: payload.rememberMe ? REMEMBER_ME_TTL_SECONDS : TOKEN_TTL_SECONDS,
  });
}

export function verifyStudentToken(token: string): TokenPayload | null {
  return verifyToken(token, 'student');
}

export function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    try {
      map[key] = decodeURIComponent(val);
    } catch {
      map[key] = val;
    }
  }
  return map;
}

export function setStudentSessionCookie(res: Response, token: string, rememberMe: boolean): void {
  res.cookie(STUDENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
    ...(rememberMe ? { maxAge: REMEMBER_ME_TTL_SECONDS * 1000 } : {}),
  });
}

export function clearStudentSessionCookie(res: Response): void {
  res.clearCookie(STUDENT_SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

function isCookieCsrfSafe(req: Request): boolean {
  const customHeader = req.headers['x-requested-with'];
  if (typeof customHeader === 'string' && customHeader.toLowerCase() === 'xmlhttprequest') {
    return true;
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      return originHost.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return false;
}

export function extractStudentSessionFromRequest(req: Request): {
  decoded: TokenPayload | null;
  viaCookie: boolean;
} {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return { decoded: verifyStudentToken(token), viaCookie: false };
  }
  const cookies = parseCookies(req);
  const cookieToken = cookies[STUDENT_SESSION_COOKIE];
  if (cookieToken) {
    return { decoded: verifyStudentToken(cookieToken), viaCookie: true };
  }
  return { decoded: null, viaCookie: false };
}

export function requireStudent(
  req: StudentRequest,
  res: Response,
  next: NextFunction
): void {
  const { decoded, viaCookie } = extractStudentSessionFromRequest(req);
  if (!decoded) {
    res.status(401).json({ error: 'লগইন সেশন পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার লগইন করুন।' });
    return;
  }

  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  if (viaCookie && isMutation && !isCookieCsrfSafe(req)) {
    res.status(403).json({ error: 'নিরাপত্তা যাচাইকরণ ব্যর্থ হয়েছে (CSRF check failed)।' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, COALESCE(u.phone, '') AS phone, u.status, ur.role,
              COALESCE(up.full_name, 'শিক্ষার্থী') AS full_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ? AND ur.role = 'student'`
    )
    .get(decoded.sub) as
    | {
        id: string;
        email: string;
        phone: string;
        status: string;
        role: 'student';
        full_name: string;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'শিক্ষার্থী অ্যাকাউন্ট পাওয়া যায়নি।' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে।' });
    return;
  }

  req.studentUser = {
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    role: 'student',
  };
  next();
}

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'অ্যাডমিনিস্ট্রেটর প্রমাণীকরণ প্রয়োজন।' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const decoded = verifyAdminToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'অ্যাডমিন সেশন সঠিক নয় বা মেয়াদ শেষ হয়েছে।' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.status, ur.role, COALESCE(up.full_name, 'Administrator') AS full_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ? AND ur.role = 'admin'`
    )
    .get(decoded.sub) as
    | {
        id: string;
        email: string;
        status: string;
        role: UserRole;
        full_name: string;
      }
    | undefined;

  if (!row) {
    res.status(403).json({ error: 'অ্যাডমিনিস্ট্রেটর অনুমতি প্রয়োজন।' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'এই অ্যাডমিনিস্ট্রেটর অ্যাকাউন্টটি স্থগিত করা হয়েছে।' });
    return;
  }

  req.adminUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
  };
  next();
}

const rateBuckets = new Map<string, number[]>();

export function rateLimit(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'local';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const prev = rateBuckets.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);
    if (active.length >= options.max) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }
    active.push(now);
    rateBuckets.set(key, active);
    next();
  };
}

export function logAdminAudit(params: {
  adminUser?: AuthenticatedAdmin;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO admin_activity_logs (id, admin_user_id, admin_email, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `log-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      params.adminUser?.id ?? null,
      params.adminUser?.email ?? 'system',
      params.action,
      params.targetType,
      params.targetId,
      params.details,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('Failed to write admin audit log:', err);
  }
}
