<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  type User = { id: number; username: string };
  let loading = $state(true);
  let needsSetup = $state(false);
  let user = $state<User | null>(null);
  let username = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let busy = $state(false);

  function setLocalUser(u: User | null) {
    if (typeof localStorage === 'undefined') return;
    if (u) localStorage.setItem('op3d_user_id', String(u.id));
    else localStorage.removeItem('op3d_user_id');
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const setupRes = await fetch('/api/setup/status', { cache: 'no-store' });
      const setupData = await setupRes.json();
      needsSetup = !!setupData.needsSetup;
      if (!needsSetup) {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
        if (meRes.ok) {
          const data = await meRes.json();
          user = data.user;
          setLocalUser(user);
        } else {
          user = null;
          setLocalUser(null);
        }
      }
    } catch {
      error = 'Server bilan bog‘lanib bo‘lmadi. Internet aloqasini tekshiring.';
    } finally {
      loading = false;
    }
  }

  async function submit() {
    error = '';
    if (needsSetup && password !== confirmPassword) {
      error = 'Parollar bir xil emas.';
      return;
    }
    if (username.trim().length < 3) {
      error = 'Login kamida 3 ta belgidan iborat bo‘lsin.';
      return;
    }
    if (password.length < 8) {
      error = 'Parol kamida 8 ta belgidan iborat bo‘lsin.';
      return;
    }

    busy = true;
    try {
      const res = await fetch(needsSetup ? '/api/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'LOGIN_FAILED') error = 'Login yoki parol noto‘g‘ri.';
        else if (data.error === 'SETUP_ALREADY_DONE') {
          needsSetup = false;
          error = 'Administrator allaqachon yaratilgan. Login orqali kiring.';
        } else error = 'Amal bajarilmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring.';
        return;
      }
      user = data.user;
      needsSetup = false;
      setLocalUser(user);
      password = '';
      confirmPassword = '';
    } catch {
      error = 'Server bilan bog‘lanib bo‘lmadi.';
    } finally {
      busy = false;
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    user = null;
    setLocalUser(null);
    password = '';
  }

  onMount(refresh);
</script>

{#if loading}
  <div class="min-h-screen bg-slate-950 flex items-center justify-center text-white">
    <div class="text-center">
      <div class="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-sm text-white/60">Yuklanmoqda…</p>
    </div>
  </div>
{:else if user}
  <div class="fixed top-3 right-3 z-[9999] flex items-center gap-2 rounded-xl bg-slate-900/90 text-white px-3 py-2 shadow-lg backdrop-blur border border-white/10">
    <span class="text-xs text-white/70">{user.username}</span>
    <button onclick={logout} class="text-xs font-semibold px-2 py-1 rounded-md bg-white/10 hover:bg-white/20">Chiqish</button>
  </div>
  {@render children()}
{:else}
  <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-6">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
      <div class="mb-7">
        <div class="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl mb-4">3D</div>
        <h1 class="text-2xl font-bold text-slate-900">OpenPlan3D</h1>
        <p class="text-sm text-slate-500 mt-1">
          {needsSetup ? 'Birinchi administrator hisobini yarating' : 'Davom etish uchun tizimga kiring'}
        </p>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Login</span>
          <input bind:value={username} autocomplete="username" class="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="admin" />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Parol</span>
          <input bind:value={password} type="password" autocomplete={needsSetup ? 'new-password' : 'current-password'} class="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Kamida 8 ta belgi" />
        </label>

        {#if needsSetup}
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Parolni takrorlang</span>
            <input bind:value={confirmPassword} type="password" autocomplete="new-password" class="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        {/if}

        {#if error}
          <div class="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>
        {/if}

        <button disabled={busy} class="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 transition-colors">
          {busy ? 'Kutilmoqda…' : needsSetup ? 'Administrator yaratish' : 'Kirish'}
        </button>
      </form>

      <p class="text-xs text-slate-400 mt-6 leading-relaxed">
        Loyihalar Cloudflare D1 bulut bazasida saqlanadi va brauzerda lokal zaxira nusxasi ham qoladi.
      </p>
    </div>
  </div>
{/if}
