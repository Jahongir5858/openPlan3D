import type { Project } from '$lib/models/types';
import { auth, db, firebaseConfigured } from '$lib/firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

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

function uid() {
  return auth?.currentUser?.uid ?? null;
}

function localKey() {
  return uid() ? `${LEGACY_KEY}_${uid()}` : `${LEGACY_KEY}_guest`;
}

function thumbnailKey(id: string) {
  return `floorplan_thumb_${uid() ?? 'guest'}_${id}`;
}

function getAll(): Record<string, string> {
  try {
    const scoped = JSON.parse(localStorage.getItem(localKey()) || '{}');
    if (Object.keys(scoped).length > 0) return scoped;

    // One-time compatibility migration from the original OpenPlan3D local storage.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    if (Object.keys(legacy).length > 0 && uid()) {
      localStorage.setItem(localKey(), JSON.stringify(legacy));
      return legacy;
    }
    return scoped;
  } catch {
    return {};
  }
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
        alert('Brauzer xotirasi to‘ldi. Joriy loyiha saqlandi, eski lokal nusxalar tozalandi. Bulutdagi nusxalar saqlanib qoladi.');
      } catch {
        alert('Brauzer xotirasi to‘ldi. Loyiha bulutga saqlanadi, lekin lokal zaxira yaratilmadi.');
      }
    } else {
      throw e;
    }
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

function cloudReady() {
  return firebaseConfigured && !!auth?.currentUser && !!db;
}

function requireCloudUser() {
  const userId = uid();
  if (!userId || !db) throw new Error('Cloud storage requires an authenticated user.');
  return { userId, firestore: db };
}

async function saveCloud(project: Project) {
  if (!cloudReady()) return;
  const { userId, firestore } = requireCloudUser();
  await setDoc(doc(firestore, 'users', userId, 'projects', project.id), {
    id: project.id,
    name: project.name,
    updatedAt: new Date(project.updatedAt).toISOString(),
    data: JSON.stringify(project),
  });
}

async function loadCloud(id: string): Promise<Project | null> {
  if (!cloudReady()) return null;
  const { userId, firestore } = requireCloudUser();
  const snap = await getDoc(doc(firestore, 'users', userId, 'projects', id));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data?.data) return null;
  return revive(data.data as string);
}

async function listCloud(): Promise<{ id: string; name: string; updatedAt: string }[]> {
  if (!cloudReady()) return [];
  const { userId, firestore } = requireCloudUser();
  const snap = await getDocs(collection(firestore, 'users', userId, 'projects'));
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      id: String(data.id ?? item.id),
      name: String(data.name ?? 'Nomsiz loyiha'),
      updatedAt: String(data.updatedAt ?? new Date(0).toISOString()),
    };
  });
}

function listLocal() {
  const all = getAll();
  return Object.values(all).map((raw) => {
    const p = JSON.parse(raw as string);
    return { id: p.id, name: p.name, updatedAt: p.updatedAt };
  });
}

export const localStore: DataStore = {
  async save(project) {
    // Always keep a browser backup first, then persist to Firestore.
    saveLocal(project);
    await saveCloud(project);
  },

  async load(id) {
    try {
      const cloud = await loadCloud(id);
      if (cloud) {
        saveLocal(cloud);
        return cloud;
      }
    } catch (e) {
      console.warn('[DataStore] Cloud load failed; using local backup.', e);
    }

    const raw = getAll()[id];
    if (!raw) return null;
    const local = revive(raw);
    // If this was a local-only project, sync it to the authenticated cloud account.
    try { await saveCloud(local); } catch (e) { console.warn('[DataStore] Cloud migration failed.', e); }
    return local;
  },

  async list() {
    const local = listLocal();
    try {
      const cloud = await listCloud();
      const merged = new Map<string, { id: string; name: string; updatedAt: string }>();
      for (const item of local) merged.set(item.id, item);
      for (const item of cloud) merged.set(item.id, item);

      // Migrate any original local-only projects to the signed-in user's cloud account.
      const cloudIds = new Set(cloud.map((p) => p.id));
      for (const item of local) {
        if (!cloudIds.has(item.id)) {
          const raw = getAll()[item.id];
          if (raw) {
            try { await saveCloud(revive(raw)); } catch (e) { console.warn('[DataStore] Cloud migration failed.', e); }
          }
        }
      }
      return Array.from(merged.values());
    } catch (e) {
      console.warn('[DataStore] Cloud list failed; using local backup.', e);
      return local;
    }
  },

  async delete(id) {
    const all = getAll();
    delete all[id];
    localStorage.setItem(localKey(), JSON.stringify(all));
    try { localStorage.removeItem(thumbnailKey(id)); } catch {}

    if (cloudReady()) {
      const { userId, firestore } = requireCloudUser();
      await deleteDoc(doc(firestore, 'users', userId, 'projects', id));
    }
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
    await this.save(dup);
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
