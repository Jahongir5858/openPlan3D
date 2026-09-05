import type { Project } from '$lib/models/types';

export interface DataStore {
  save(project: Project): Promise<void>;
  load(id: string): Promise<Project | null>;
  list(): Promise<{ id: string; name: string; updatedAt: string }[]>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Project | null>;
  saveThumbnail(id: string, dataUrl: string): void;
  getThumbnail(id: string): string | null;
}

const LEGACY_KEY = 'floorplan_projects';

function userId() {
  try { return localStorage.getItem('op3d_user_id') || 'guest'; } catch { return 'guest'; }
}

function key() { return `${LEGACY_KEY}_${userId()}`; }
function thumbKey(id: string) { return `floorplan_thumb_${userId()}_${id}`; }

function getAll(): Record<string, string> {
  try {
    const scoped = JSON.parse(localStorage.getItem(key()) || '{}');
    if (Object.keys(scoped).length) return scoped;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    if (Object.keys(legacy).length && userId() !== 'guest') {
      localStorage.setItem(key(), JSON.stringify(legacy));
      return legacy;
    }
    return scoped;
  } catch { return {}; }
}

function saveLocal(project: Project) {
  const all = getAll();
  all[project.id] = JSON.stringify(project);
  try {
    localStorage.setItem(key(), JSON.stringify(all));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
      try {
        localStorage.setItem(key(), JSON.stringify({ [project.id]: all[project.id] }));
        alert('Brauzer xotirasi to‘ldi. Joriy loyiha lokal saqlandi, eski lokal nusxalar tozalandi. Bulutdagi nusxalar saqlanadi.');
      } catch {
        alert('Brauzer xotirasi to‘ldi. Bulutli saqlash ishlashda davom etadi.');
      }
    } else throw e;
  }
}

function revive(raw: string): Project {
  const p = JSON.parse(raw);
  p.createdAt = new Date(p.createdAt);
  p.updatedAt = new Date(p.updatedAt);
  for (const floor of (p.floors ?? [])) {
    if (!floor.rooms) floor.rooms = [];
    if (!floor.doors) floor.doors = [];
    if (!floor.windows) floor.windows = [];
    if (!floor.furniture) floor.furniture = [];
    if (!floor.stairs) floor.stairs = [];
    if (!floor.columns) floor.columns = [];
  }
  return p as Project;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, cache: 'no-store' });
  if (res.status === 401) {
    window.location.reload();
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res;
}

async function saveCloud(project: Project) {
  await api(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: project.id,
      name: project.name,
      updatedAt: new Date(project.updatedAt).toISOString(),
      data: JSON.stringify(project)
    })
  });
}

export const localStore: DataStore = {
  async save(project) {
    saveLocal(project);
    await saveCloud(project);
  },

  async load(id) {
    try {
      const res = await api(`/api/projects/${encodeURIComponent(id)}`);
      const cloud = await res.json();
      if (cloud?.data) {
        const project = revive(cloud.data);
        saveLocal(project);
        return project;
      }
    } catch (e) {
      console.warn('[DataStore] Cloud load failed; using local backup.', e);
    }
    const raw = getAll()[id];
    if (!raw) return null;
    const project = revive(raw);
    try { await saveCloud(project); } catch {}
    return project;
  },

  async list() {
    const local = Object.values(getAll()).map((raw) => {
      const p = JSON.parse(raw as string);
      return { id: p.id, name: p.name, updatedAt: p.updatedAt };
    });
    try {
      const res = await api('/api/projects');
      const cloud = await res.json() as { id: string; name: string; updatedAt: string }[];
      const merged = new Map(local.map(x => [x.id, x]));
      for (const item of cloud) merged.set(item.id, item);
      const cloudIds = new Set(cloud.map(x => x.id));
      for (const item of local) {
        if (!cloudIds.has(item.id)) {
          const raw = getAll()[item.id];
          if (raw) { try { await saveCloud(revive(raw)); } catch {} }
        }
      }
      return Array.from(merged.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (e) {
      console.warn('[DataStore] Cloud list failed; using local backup.', e);
      return local;
    }
  },

  async delete(id) {
    const all = getAll();
    delete all[id];
    localStorage.setItem(key(), JSON.stringify(all));
    try { localStorage.removeItem(thumbKey(id)); } catch {}
    await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async duplicate(id: string): Promise<Project | null> {
    const original = await this.load(id);
    if (!original) return null;
    const newId = Math.random().toString(36).slice(2, 10);
    const dup: Project = { ...original, id: newId, name: `${original.name} (Nusxa)`, createdAt: new Date(), updatedAt: new Date() };
    await this.save(dup);
    try {
      const thumb = localStorage.getItem(thumbKey(id));
      if (thumb) localStorage.setItem(thumbKey(newId), thumb);
    } catch {}
    return dup;
  },

  saveThumbnail(id: string, dataUrl: string) {
    try { localStorage.setItem(thumbKey(id), dataUrl); } catch {}
  },

  getThumbnail(id: string): string | null {
    try { return localStorage.getItem(thumbKey(id)); } catch { return null; }
  },
};
