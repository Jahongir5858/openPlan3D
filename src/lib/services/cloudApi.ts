const USER_KEY = 'openplan3d_cloud_user';

export type CloudUser = { username: string; userId?: number; expiresAt?: string };
export type CloudProjectSummary = { id: string; name: string; updatedAt: string };

export function currentCloudUser(): CloudUser | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user: CloudUser) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCloudSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, allow401 = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  let data: any = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401 && !allow401) clearCloudSession();
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export async function setupStatus() {
  return request<{ needsSetup: boolean }>('/api/setup/status', {}, true);
}

export async function setupAdmin(setupKey: string, username: string, password: string) {
  return request<{ ok: true; username: string }>('/api/setup', {
    method: 'POST',
    body: JSON.stringify({ setupKey, username, password }),
  }, true);
}

export async function loginCloud(username: string, password: string) {
  const data = await request<{ username: string; expiresAt: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }, true);
  const user = { username: data.username, expiresAt: data.expiresAt };
  saveUser(user);
  return user;
}

export async function validateCloudSession(): Promise<CloudUser | null> {
  try {
    const data = await request<{ authenticated: true; username: string; userId: number; expiresAt: string }>('/api/auth/me');
    const user = { username: data.username, userId: data.userId, expiresAt: data.expiresAt };
    saveUser(user);
    return user;
  } catch {
    clearCloudSession();
    return null;
  }
}

export async function logoutCloud() {
  try { await request('/api/auth/logout', { method: 'POST' }, true); } catch {}
  clearCloudSession();
}

export async function listCloudProjects() {
  const data = await request<{ projects: CloudProjectSummary[] }>('/api/projects');
  return data.projects;
}

export async function loadCloudProject(id: string) {
  const data = await request<{ project: { id: string; name: string; data: string; updatedAt: string } }>(`/api/projects/${encodeURIComponent(id)}`);
  return data.project;
}

export async function saveCloudProject(project: { id: string; name: string; updatedAt: Date | string }, serialized: string) {
  return request<{ ok: true; id: string; updatedAt: string }>(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: project.name,
      updatedAt: project.updatedAt instanceof Date ? project.updatedAt.toISOString() : project.updatedAt,
      data: serialized,
    }),
  });
}

export async function deleteCloudProject(id: string) {
  return request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
