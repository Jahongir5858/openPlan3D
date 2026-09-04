import type { Project } from '$lib/models/types';
import {
  currentCloudUser,
  deleteCloudProject,
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
} from '$lib/services/cloudApi';

export interface DataStore {
  save(project: Project): Promise<void>;
  syncNow(project: Project): Promise<void>;
  load(id: string): Promise<Project | null>;
  list(): Promise<{ id: string; name: string; updatedAt: string }[]>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Project | null>;
  saveThumbnail(id: string, dataUrl: string): void;
  getThumbnail(id: string): string | null;
}

const LEGACY_KEY = 'floorplan_projects';
const CLOUD_INTERVAL_MS = 30_000;
const lastCloudSave = new Map<string, number>();
const cloudTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingProjects = new Map<string, Project>();

function userScope() {
  return currentCloudUser()?.username ?? 'guest';
}

function localKey() {
  return `${LEGACY_KEY}_${userScope()}`;
}

function thumbnailKey(id: string) {
  return `floorplan_thumb_${userScope()}_${id}`;
}

function getAll(): Record<string, string> {
  try {
    const scoped = JSON.parse(localStorage.getItem(localKey()) || '{}');
    if (Object.keys(scoped).length > 0) return scoped;

    // One-time migration from the original browser-only OpenPlan3D storage.
    if (currentCloudUser()) {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
      if (Object.keys(legacy).length > 0) {
        localStorage.setItem(localKey(), JSON.stringify(legacy));
        return legacy;
      }
    }
    return scoped;
  } catch {
    return {};
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
    if (!floor.guides) floor.guides = [];
    if (!floor.measurements) floor.measurements = [];
    if (!floor.annotations) floor.annotations = [];
    if (!floor.textAnnotations) floor.textAnnotations = [];
    if (!floor.groups) floor.groups = [];
  }
  return p as Project;
}

function saveLocal(project: Project) {
  const all = getAll();
  all[project.id] = JSON.stringify(project);
  try {
    localStorage.setItem(localKey(), JSON.stringify(all));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
      console.warn('[DataStore] localStorage quota exceeded');
      const minimal: Record<string, string> = { [project.id]: all[project.id] };
      try {
        localStorage.setItem(localKey(), JSON.stringify(minimal));
        alert('Brauzer xotirasi to‘ldi. Joriy loyiha lokal saqlandi, eski lokal nusxalar tozalandi. Bulutdagi loyihalar saqlanib qoladi.');
      } catch {
        alert('Brauzer xotirasi to‘ldi. Bulutli saqlash ishlaydi, lekin lokal zaxira yaratilmadi.');
      }
    } else {
      throw e;
    }
  }
}

async function pushCloud(project: Project) {
  if (!currentCloudUser()) return;
  const serialized = JSON.stringify(project);
  await saveCloudProject(project, serialized);
  lastCloudSave.set(project.id, Date.now());
}

async function queueCloud(project: Project) {
  if (!currentCloudUser()) return;
  pendingProjects.set(project.id, project);
  const elapsed = Date.now() - (lastCloudSave.get(project.id) ?? 0);
  if (elapsed >= CLOUD_INTERVAL_MS) {
    const old = cloudTimers.get(project.id);
    if (old) clearTimeout(old);
    cloudTimers.delete(project.id);
    pendingProjects.delete(project.id);
    await pushCloud(project);
    return;
  }
  if (cloudTimers.has(project.id)) return;
  const wait = CLOUD_INTERVAL_MS - elapsed;
  const timer = setTimeout(async () => {
    cloudTimers.delete(project.id);
    const latest = pendingProjects.get(project.id);
    pendingProjects.delete(project.id);
    if (!latest) return;
    try { await pushCloud(latest); }
    catch (e) { console.warn('[DataStore] Deferred cloud save failed.', e); }
  }, wait);
  cloudTimers.set(project.id, timer);
}

function localList() {
  return Object.values(getAll()).map((raw) => {
    const p = JSON.parse(raw as string);
    return { id: String(p.id), name: String(p.name ?? 'Nomsiz loyiha'), updatedAt: String(p.updatedAt) };
  });
}

function time(value: string | Date | undefined) {
  const n = value ? new Date(value).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
}

export const localStore: DataStore = {
  async save(project) {
    // Local backup is immediate. Cloud writes are throttled to at most once/30s per project.
    saveLocal(project);
    await queueCloud(project);
  },

  async syncNow(project) {
    saveLocal(project);
    const timer = cloudTimers.get(project.id);
    if (timer) clearTimeout(timer);
    cloudTimers.delete(project.id);
    pendingProjects.delete(project.id);
    await pushCloud(project);
  },

  async load(id) {
    const raw = getAll()[id];
    const local = raw ? revive(raw) : null;

    try {
      if (currentCloudUser()) {
        const cloudRow = await loadCloudProject(id);
        if (cloudRow?.data) {
          const cloud = revive(cloudRow.data);
          // Never replace an unsynced/newer browser copy with an older cloud copy.
          if (local && time(local.updatedAt) > time(cloud.updatedAt)) {
            try { await pushCloud(local); }
            catch (e) { console.warn('[DataStore] Newer local copy could not be synced yet.', e); }
            return local;
          }
          saveLocal(cloud);
          return cloud;
        }
      }
    } catch (e) {
      console.warn('[DataStore] Cloud load failed; local backup will be used.', e);
    }

    if (!local) return null;
    try { await pushCloud(local); } catch (e) { console.warn('[DataStore] Local-to-cloud migration failed.', e); }
    return local;
  },

  async list() {
    const local = localList();
    if (!currentCloudUser()) return local;
    try {
      const cloud = await listCloudProjects();
      const merged = new Map<string, { id: string; name: string; updatedAt: string }>();
      for (const p of cloud) merged.set(p.id, p);
      for (const p of local) {
        const existing = merged.get(p.id);
        if (!existing || time(p.updatedAt) > time(existing.updatedAt)) merged.set(p.id, p);
      }

      // Upload projects that only exist locally, or whose local backup is newer.
      const cloudById = new Map(cloud.map((p) => [p.id, p]));
      for (const item of local) {
        const cloudItem = cloudById.get(item.id);
        if (cloudItem && time(cloudItem.updatedAt) >= time(item.updatedAt)) continue;
        const localRaw = getAll()[item.id];
        if (!localRaw) continue;
        try { await pushCloud(revive(localRaw)); }
        catch (e) { console.warn('[DataStore] Cloud migration/sync failed.', e); }
      }
      return Array.from(merged.values()).sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    } catch (e) {
      console.warn('[DataStore] Cloud list failed; local backup will be used.', e);
      return local.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    }
  },

  async delete(id) {
    const all = getAll();
    delete all[id];
    localStorage.setItem(localKey(), JSON.stringify(all));
    try { localStorage.removeItem(thumbnailKey(id)); } catch {}
    const timer = cloudTimers.get(id);
    if (timer) clearTimeout(timer);
    cloudTimers.delete(id);
    pendingProjects.delete(id);
    if (currentCloudUser()) await deleteCloudProject(id);
  },

  async duplicate(id: string): Promise<Project | null> {
    const original = await this.load(id);
    if (!original) return null;
    const newId = Math.random().toString(36).slice(2, 10);
    const dup: Project = {
      ...original,
      id: newId,
      name: `${original.name} (Nusxa)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.syncNow(dup);
    try {
      const thumb = localStorage.getItem(thumbnailKey(id));
      if (thumb) localStorage.setItem(thumbnailKey(newId), thumb);
    } catch {}
    return dup;
  },

  saveThumbnail(id: string, dataUrl: string) {
    try { localStorage.setItem(thumbnailKey(id), dataUrl); } catch {}
  },

  getThumbnail(id: string): string | null {
    try { return localStorage.getItem(thumbnailKey(id)); } catch { return null; }
  },
};
