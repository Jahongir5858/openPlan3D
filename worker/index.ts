interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface SessionUser {
  id: number;
  username: string;
}

const COOKIE = 'op3d_session';
const SESSION_DAYS = 30;
const CHUNK_SIZE = 350_000;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });

function parseCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(value: string): Uint8Array {
  const s = atob(value);
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64(new Uint8Array(digest));
}

async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt ? base64ToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(saltBytes) };
}

async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = parseCookie(request, COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(tokenHash, now).first<SessionUser>();
  return row ?? null;
}

async function requireUser(request: Request, env: Env): Promise<SessionUser | Response> {
  const user = await getSessionUser(request, env);
  return user ?? json({ error: 'AUTH_REQUIRED' }, 401);
}

async function cleanupSessions(env: Env) {
  try { await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()).run(); } catch {}
}

async function setupStatus(env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  return json({ needsSetup: Number(row?.count ?? 0) === 0 });
}

async function setup(request: Request, env: Env) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if (Number(count?.count ?? 0) !== 0) return json({ error: 'SETUP_ALREADY_DONE' }, 409);

  const body = await request.json<any>().catch(() => null);
  const username = String(body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    return json({ error: 'USERNAME_INVALID' }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: 'PASSWORD_INVALID' }, 400);
  }

  const { hash, salt } = await hashPassword(password);
  try {
    await env.DB.prepare(
      'INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)'
    ).bind(username, hash, salt, Date.now()).run();
  } catch {
    return json({ error: 'SETUP_FAILED' }, 409);
  }
  return loginWithCredentials(username, password, env);
}

async function loginWithCredentials(username: string, password: string, env: Env) {
  const row = await env.DB.prepare(
    'SELECT id, username, password_hash, password_salt FROM users WHERE username = ?'
  ).bind(username).first<any>();
  if (!row) return json({ error: 'LOGIN_FAILED' }, 401);

  const { hash } = await hashPassword(password, row.password_salt);
  if (hash !== row.password_hash) return json({ error: 'LOGIN_FAILED' }, 401);

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64(tokenBytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const tokenHash = await sha256(token);
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenHash, row.id, expiresAt, Date.now()).run();

  return json(
    { user: { id: row.id, username: row.username } },
    200,
    { 'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}` }
  );
}

async function login(request: Request, env: Env) {
  const body = await request.json<any>().catch(() => null);
  const username = String(body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  return loginWithCredentials(username, password, env);
}

async function logout(request: Request, env: Env) {
  const token = parseCookie(request, COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return json({ ok: true }, 200, {
    'set-cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  });
}

async function me(request: Request, env: Env) {
  const user = await getSessionUser(request, env);
  return user ? json({ user }) : json({ error: 'AUTH_REQUIRED' }, 401);
}

function splitChunks(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) chunks.push(data.slice(i, i + CHUNK_SIZE));
  return chunks.length ? chunks : [''];
}

async function listProjects(user: SessionUser, env: Env) {
  const rows = await env.DB.prepare(
    'SELECT id, name, updated_at AS updatedAt FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(user.id).all();
  return json(rows.results ?? []);
}

async function getProject(user: SessionUser, projectId: string, env: Env) {
  const meta = await env.DB.prepare(
    'SELECT id, name, updated_at AS updatedAt, chunk_count AS chunkCount FROM projects WHERE user_id = ? AND id = ?'
  ).bind(user.id, projectId).first<any>();
  if (!meta) return json({ error: 'NOT_FOUND' }, 404);

  const rows = await env.DB.prepare(
    'SELECT data FROM project_chunks WHERE user_id = ? AND project_id = ? ORDER BY chunk_index ASC'
  ).bind(user.id, projectId).all<any>();
  const data = (rows.results ?? []).map((r: any) => String(r.data ?? '')).join('');
  return json({ id: meta.id, name: meta.name, updatedAt: meta.updatedAt, data });
}

async function putProject(request: Request, user: SessionUser, projectId: string, env: Env) {
  const body = await request.json<any>().catch(() => null);
  const data = String(body?.data ?? '');
  const name = String(body?.name ?? 'Nomsiz loyiha').slice(0, 200);
  const updatedAt = String(body?.updatedAt ?? new Date().toISOString());
  if (!data || data.length > 15_000_000) return json({ error: 'PROJECT_TOO_LARGE' }, 413);

  const chunks = splitChunks(data);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO projects (user_id, id, name, updated_at, chunk_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at,
         chunk_count = excluded.chunk_count`
    ).bind(user.id, projectId, name, updatedAt, chunks.length),
    env.DB.prepare('DELETE FROM project_chunks WHERE user_id = ? AND project_id = ?').bind(user.id, projectId)
  ];
  chunks.forEach((chunk, index) => {
    statements.push(
      env.DB.prepare(
        'INSERT INTO project_chunks (user_id, project_id, chunk_index, data) VALUES (?, ?, ?, ?)'
      ).bind(user.id, projectId, index, chunk)
    );
  });
  await env.DB.batch(statements);
  return json({ ok: true, chunks: chunks.length });
}

async function deleteProject(user: SessionUser, projectId: string, env: Env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM project_chunks WHERE user_id = ? AND project_id = ?').bind(user.id, projectId),
    env.DB.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').bind(user.id, projectId)
  ]);
  return json({ ok: true });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/setup/status' && request.method === 'GET') return setupStatus(env);
  if (path === '/api/setup' && request.method === 'POST') return setup(request, env);
  if (path === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
  if (path === '/api/auth/me' && request.method === 'GET') return me(request, env);

  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;
  const user = auth as SessionUser;

  if (path === '/api/projects' && request.method === 'GET') return listProjects(user, env);
  const match = path.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const projectId = decodeURIComponent(match[1]);
    if (request.method === 'GET') return getProject(user, projectId, env);
    if (request.method === 'PUT') return putProject(request, user, projectId, env);
    if (request.method === 'DELETE') return deleteProject(user, projectId, env);
  }

  return json({ error: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      cleanupSessions(env);
      try {
        return await api(request, env);
      } catch (error) {
        console.error(error);
        return json({ error: 'SERVER_ERROR' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
