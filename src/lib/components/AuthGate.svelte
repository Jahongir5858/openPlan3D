<script lang="ts">
  import { onMount } from 'svelte';
  import {
    browserSessionPersistence,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    type User,
  } from 'firebase/auth';
  import { auth, firebaseConfigured } from '$lib/firebase';

  let { children } = $props();

  let user: User | null = $state(null);
  let ready = $state(false);
  let login = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    if (!firebaseConfigured || !auth) {
      ready = true;
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      user = nextUser;
      ready = true;
    });
  });

  function normalizeLogin(value: string) {
    const trimmed = value.trim().toLowerCase();
    return trimmed.includes('@') ? trimmed : `${trimmed}@openplan3d.local`;
  }

  function friendlyError(code?: string) {
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Login yoki parol noto‘g‘ri.';
    }
    if (code === 'auth/too-many-requests') return 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.';
    if (code === 'auth/network-request-failed') return 'Internet bilan bog‘lanishda xato.';
    return 'Tizimga kirishda xato yuz berdi.';
  }

  async function handleLogin(event: SubmitEvent) {
    event.preventDefault();
    if (!auth || !login.trim() || !password) return;
    busy = true;
    error = '';
    try {
      // Session persistence: browser oynalari yopilgach qayta login talab qilinadi.
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, normalizeLogin(login), password);
      password = '';
    } catch (e: any) {
      error = friendlyError(e?.code);
    } finally {
      busy = false;
    }
  }

  async function logout() {
    if (!auth) return;
    await signOut(auth);
    login = '';
    password = '';
  }

  function displayLogin(email: string | null) {
    if (!email) return 'Foydalanuvchi';
    return email.endsWith('@openplan3d.local') ? email.replace('@openplan3d.local', '') : email;
  }
</script>

{#if !firebaseConfigured}
  <div class="min-h-screen bg-slate-950 flex items-center justify-center p-6">
    <div class="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
      <div class="text-4xl mb-4">🔐</div>
      <h1 class="text-2xl font-bold text-slate-900 mb-2">Bulutli kirish sozlanmagan</h1>
      <p class="text-sm text-slate-600 leading-6">
        Firebase konfiguratsiyasi GitHub Actions o‘zgaruvchilariga kiritilgach login va bulutli saqlash avtomatik ishlaydi.
      </p>
      <div class="mt-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        Administrator Firebase loyihasini sozlashi kerak.
      </div>
    </div>
  </div>
{:else if !ready}
  <div class="min-h-screen bg-slate-950 flex items-center justify-center text-white">
    <div class="text-center">
      <div class="text-3xl mb-3">🏠</div>
      <div class="text-sm text-white/70">Tekshirilmoqda…</div>
    </div>
  </div>
{:else if !user}
  <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-5">
    <div class="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
      <div class="bg-slate-900 px-7 py-6 text-white">
        <div class="text-3xl mb-3">🏢</div>
        <h1 class="text-xl font-bold">OpenPlan3D</h1>
        <p class="text-sm text-white/60 mt-1">Bino loyihalari tizimi</p>
      </div>
      <form class="p-7 space-y-4" onsubmit={handleLogin}>
        <div>
          <label for="login" class="block text-sm font-semibold text-slate-700 mb-1.5">Login</label>
          <input
            id="login"
            autocomplete="username"
            bind:value={login}
            placeholder="Loginni kiriting"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label for="password" class="block text-sm font-semibold text-slate-700 mb-1.5">Parol</label>
          <input
            id="password"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            placeholder="Parolni kiriting"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        {#if error}
          <div class="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>
        {/if}
        <button
          type="submit"
          disabled={busy}
          class="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </button>
      </form>
    </div>
  </div>
{:else}
  <div class="fixed z-[9999] right-3 bottom-3 flex items-center gap-2 rounded-xl bg-slate-900/95 text-white shadow-lg px-3 py-2 text-xs backdrop-blur">
    <span class="max-w-36 truncate">👤 {displayLogin(user.email)}</span>
    <button onclick={logout} class="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 font-semibold">Chiqish</button>
  </div>
  {@render children()}
{/if}
