interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SETUP_KEY: string;
}

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  iterations: number;
  created_at: string;
};

type SessionRow = {
  user_id: number;
  username: string;
  expires_at: string;
};

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 210_000;
const SESSION_COOKIE = 'openplan3d_session';

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function derivePassword(password: string, saltB64: string, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bytesToBase64(salt);
  return {
    salt: saltB64,
    iterations: PBKDF2_ITERATIONS,
    hash: await derivePassword(password, saltB64),
  };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieToken(request: Request) {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function bearerToken(request: Request) {
  const value = request.headers.get('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function sessionToken(request: Request) {
  // Cookie is the normal browser path. Bearer support is retained for API tooling.
  return cookieToken(request) || bearerToken(request);
}

function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function sessionUser(request: Request, env: Env): Promise<SessionRow | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.user_id, u.username, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? LIMIT 1`,
  ).bind(tokenHash).first<SessionRow>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return row;
}

async function requireUser(request: Request, env: Env) {
  const user = await sessionUser(request, env);
  if (!user) return { error: json({ error: 'Avtorizatsiya talab qilinadi' }, 401) } as const;
  return { user } as const;
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json<T>();
  } catch {
    return null;
  }
}

function cleanUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function validUsername(username: string) {
  return /^[a-z0-9._-]{3,64}$/.test(username);
}

function validPassword(password: unknown) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

async function setupStatus(env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  return json({ needsSetup: Number(row?.count ?? 0) === 0 });
}

async function setupAdmin(request: Request, env: Env) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if (Number(count?.count ?? 0) > 0) return json({ error: 'Administrator allaqachon yaratilgan' }, 409);

  const body = await readBody<{ setupKey?: string; username?: string; password?: string }>(request);
  if (!body) return json({ error: 'Noto‘g‘ri so‘rov' }, 400);
  if (!env.SETUP_KEY || body.setupKey !== env.SETUP_KEY) return json({ error: 'Setup kaliti noto‘g‘ri' }, 403);

  const username = cleanUsername(body.username);
  if (!validUsername(username)) return json({ error: 'Login 3–64 belgidan iborat bo‘lsin: a-z, 0-9, nuqta, _ yoki -' }, 400);
  if (!validPassword(body.password)) return json({ error: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' }, 400);

  const p = await createPasswordHash(body.password!);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO users (username, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(username, p.hash, p.salt, p.iterations, now).run();
  return json({ ok: true, username }, 201);
}

async function login(request: Request, env: Env) {
  const body = await readBody<{ username?: string; password?: string }>(request);
  if (!body) return json({ error: 'Noto‘g‘ri so‘rov' }, 400);
  const username = cleanUsername(body.username);
  const password = body.password ?? '';

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, salt, iterations, created_at FROM users WHERE username = ? LIMIT 1',
  ).bind(username).first<UserRow>();
  if (!user || !validPassword(password)) return json({ error: 'Login yoki parol noto‘g‘ri' }, 401);

  const candidate = await derivePassword(password, user.salt, user.iterations);
  if (!timingSafeEqual(candidate, user.password_hash)) return json({ error: 'Login yoki parol noto‘g‘ri' }, 401);

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(tokenHash, user.id, now.toISOString(), expires.toISOString()).run();

  // Opportunistic cleanup of expired sessions.
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now.toISOString()).run();
  return json(
    { username: user.username, expiresAt: expires.toISOString() },
    200,
    { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) },
  );
}

async function logout(request: Request, env: Env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function me(request: Request, env: Env) {
  const user = await sessionUser(request, env);
  if (!user) return json({ authenticated: false }, 401, { 'set-cookie': clearSessionCookie() });
  return json({ authenticated: true, username: user.username, userId: user.user_id, expiresAt: user.expires_at });
}

async function listProjects(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if ('error' in auth) return auth.error;
  const result = await env.DB.prepare(
    'SELECT id, name, updated_at AS updatedAt FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
  ).bind(auth.user.user_id).all();
  return json({ projects: result.results ?? [] });
}

async function getProject(request: Request, env: Env, id: string) {
  const auth = await requireUser(request, env);
  if ('error' in auth) return auth.error;
  const row = await env.DB.prepare(
    'SELECT id, name, data, created_at AS createdAt, updated_at AS updatedAt FROM projects WHERE user_id = ? AND id = ? LIMIT 1',
  ).bind(auth.user.user_id, id).first();
  if (!row) return json({ error: 'Loyiha topilmadi' }, 404);
  return json({ project: row });
}

async function saveProject(request: Request, env: Env, id: string) {
  const auth = await requireUser(request, env);
  if ('error' in auth) return auth.error;
  const body = await readBody<{ name?: string; data?: string; updatedAt?: string }>(request);
  if (!body || typeof body.data !== 'string' || body.data.length === 0) return json({ error: 'Loyiha ma’lumoti topilmadi' }, 400);
  if (body.data.length > 4_000_000) return json({ error: 'Loyiha hajmi 4 MB dan katta' }, 413);

  let parsed: any;
  try { parsed = JSON.parse(body.data); } catch { return json({ error: 'Loyiha JSON formati noto‘g‘ri' }, 400); }
  if (String(parsed?.id ?? '') !== id) return json({ error: 'Loyiha ID mos emas' }, 400);

  const name = String(body.name ?? parsed?.name ?? 'Nomsiz loyiha').slice(0, 200);
  const now = new Date().toISOString();
  const updatedAt = body.updatedAt && !Number.isNaN(Date.parse(body.updatedAt)) ? new Date(body.updatedAt).toISOString() : now;
  await env.DB.prepare(
    `INSERT INTO projects (user_id, id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(auth.user.user_id, id, name, body.data, now, updatedAt).run();
  return json({ ok: true, id, updatedAt });
}

async function deleteProject(request: Request, env: Env, id: string) {
  const auth = await requireUser(request, env);
  if ('error' in auth) return auth.error;
  await env.DB.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').bind(auth.user.user_id, id).run();
  return json({ ok: true });
}

async function api(request: Request, env: Env, url: URL) {
  const method = request.method.toUpperCase();
  if (url.pathname === '/api/health') return json({ ok: true, service: 'OpenPlan3D Cloudflare API' });
  if (url.pathname === '/api/setup/status' && method === 'GET') return setupStatus(env);
  if (url.pathname === '/api/setup' && method === 'POST') return setupAdmin(request, env);
  if (url.pathname === '/api/auth/login' && method === 'POST') return login(request, env);
  if (url.pathname === '/api/auth/logout' && method === 'POST') return logout(request, env);
  if (url.pathname === '/api/auth/me' && method === 'GET') return me(request, env);
  if (url.pathname === '/api/projects' && method === 'GET') return listProjects(request, env);

  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return json({ error: 'Loyiha ID noto‘g‘ri' }, 400);
    if (method === 'GET') return getProject(request, env, id);
    if (method === 'PUT') return saveProject(request, env, id);
    if (method === 'DELETE') return deleteProject(request, env, id);
  }
  return json({ error: 'API manzili topilmadi' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ error: 'Server xatosi' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
