<script lang="ts">
  import { onMount } from 'svelte';
  import {
    currentCloudUser,
    loginCloud,
    logoutCloud,
    setupAdmin,
    setupStatus,
    validateCloudSession,
    type CloudUser,
  } from '$lib/services/cloudApi';

  let { children } = $props();

  let loading = $state(true);
  let user = $state<CloudUser | null>(null);
  let needsSetup = $state(false);
  let username = $state('');
  let password = $state('');
  let setupKey = $state('');
  let confirmPassword = $state('');
  let busy = $state(false);
  let error = $state('');

  onMount(async () => {
    user = currentCloudUser();
    if (user) user = await validateCloudSession();
    if (!user) {
      try {
        const status = await setupStatus();
        needsSetup = status.needsSetup;
      } catch (e: any) {
        error = `Cloudflare API bilan bog‘lanib bo‘lmadi: ${e?.message ?? e}`;
      }
    }
    loading = false;
  });

  async function submitLogin() {
    error = '';
    if (!username.trim() || !password) {
      error = 'Login va parolni kiriting.';
      return;
    }
    busy = true;
    try {
      user = await loginCloud(username.trim(), password);
      password = '';
    } catch (e: any) {
      error = e?.message ?? 'Kirishda xato yuz berdi.';
    } finally {
      busy = false;
    }
  }

  async function submitSetup() {
    error = '';
    if (!setupKey || !username.trim() || !password) {
      error = 'Setup kaliti, login va parolni kiriting.';
      return;
    }
    if (password !== confirmPassword) {
      error = 'Parollar bir xil emas.';
      return;
    }
    if (password.length < 8) {
      error = 'Parol kamida 8 belgidan iborat bo‘lsin.';
      return;
    }
    busy = true;
    try {
      await setupAdmin(setupKey, username.trim(), password);
      needsSetup = false;
      setupKey = '';
      confirmPassword = '';
      user = await loginCloud(username.trim(), password);
      password = '';
    } catch (e: any) {
      error = e?.message ?? 'Administrator yaratishda xato yuz berdi.';
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    await logoutCloud();
    user = null;
    username = '';
    password = '';
  }
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-slate-950 text-white">
    <div class="text-center">
      <div class="w-10 h-10 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin mx-auto"></div>
      <p class="mt-4 text-sm text-white/60">Tizim tekshirilmoqda…</p>
    </div>
  </div>
{:else if user}
  <div class="fixed top-2 right-2 z-[9999] flex items-center gap-2 rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur border border-white/10">
    <span class="max-w-40 truncate">👤 {user.username}</span>
    <button onclick={signOut} class="rounded-md bg-white/10 px-2 py-1 hover:bg-red-500/80 transition-colors">Chiqish</button>
  </div>
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-7">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-blue-500/15 border border-blue-400/25 flex items-center justify-center text-3xl">🏢</div>
        <h1 class="mt-4 text-2xl font-bold">OpenPlan3D</h1>
        <p class="mt-1 text-sm text-white/50">Hududiy ijtimoiy xizmatlar markazlari uchun 2D/3D rejalashtiruvchi</p>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl">
        {#if needsSetup}
          <div class="mb-5">
            <h2 class="text-lg font-semibold">Birinchi administratorni yaratish</h2>
            <p class="text-xs text-white/45 mt-1">Bu oyna faqat baza bo‘sh bo‘lganda chiqadi. Keyin yangi foydalanuvchi saytdan ro‘yxatdan o‘ta olmaydi.</p>
          </div>
          <form onsubmit={(e) => { e.preventDefault(); submitSetup(); }} class="space-y-4">
            <label class="block">
              <span class="text-xs text-white/60">Cloudflare setup kaliti</span>
              <input type="password" bind:value={setupKey} autocomplete="off" class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" placeholder="SETUP_KEY" />
            </label>
            <label class="block">
              <span class="text-xs text-white/60">Login</span>
              <input bind:value={username} autocomplete="username" class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" placeholder="admin" />
            </label>
            <label class="block">
              <span class="text-xs text-white/60">Parol</span>
              <input type="password" bind:value={password} autocomplete="new-password" class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" placeholder="Kamida 8 belgi" />
            </label>
            <label class="block">
              <span class="text-xs text-white/60">Parolni takrorlang</span>
              <input type="password" bind:value={confirmPassword} autocomplete="new-password" class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" />
            </label>
            {#if error}<p class="rounded-lg bg-red-500/10 border border-red-400/20 px-3 py-2 text-sm text-red-200">{error}</p>{/if}
            <button disabled={busy} class="w-full rounded-lg bg-blue-500 py-2.5 font-semibold hover:bg-blue-400 disabled:opacity-50">{busy ? 'Yaratilmoqda…' : 'Administrator yaratish'}</button>
          </form>
        {:else}
          <div class="mb-5">
            <h2 class="text-lg font-semibold">Tizimga kirish</h2>
            <p class="text-xs text-white/45 mt-1">Bino loyihalariga kirish uchun login va parolingizni kiriting.</p>
          </div>
          <form onsubmit={(e) => { e.preventDefault(); submitLogin(); }} class="space-y-4">
            <label class="block">
              <span class="text-xs text-white/60">Login</span>
              <input bind:value={username} autocomplete="username" autofocus class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" placeholder="Login" />
            </label>
            <label class="block">
              <span class="text-xs text-white/60">Parol</span>
              <input type="password" bind:value={password} autocomplete="current-password" class="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-blue-400" placeholder="Parol" />
            </label>
            {#if error}<p class="rounded-lg bg-red-500/10 border border-red-400/20 px-3 py-2 text-sm text-red-200">{error}</p>{/if}
            <button disabled={busy} class="w-full rounded-lg bg-blue-500 py-2.5 font-semibold hover:bg-blue-400 disabled:opacity-50">{busy ? 'Tekshirilmoqda…' : 'Kirish'}</button>
          </form>
        {/if}
      </div>
      <p class="text-center text-[11px] text-white/30 mt-4">Loyihalar Cloudflare D1 bazasida va brauzerda zaxira nusxa sifatida saqlanadi.</p>
    </div>
  </div>
{/if}
