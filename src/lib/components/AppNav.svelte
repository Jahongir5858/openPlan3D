<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';

  let { active = 'projects' }: { active?: 'dashboard' | 'map' | 'projects' | 'admin' } = $props();
  let isAdmin = $state(false);

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      isAdmin = data?.user?.role === 'admin' || Number(data?.user?.id) === 1;
    } catch {}
  });

  const items = [
    { id: 'dashboard', label: 'Dashboard', href: `${base}/dashboard`, icon: 'dashboard' },
    { id: 'map', label: 'Xarita', href: `${base}/map`, icon: 'map' },
    { id: 'projects', label: 'Bino reja muharriri', href: `${base}/`, icon: 'plan' }
  ] as const;
</script>

<nav class="platform-nav" aria-label="Asosiy bo‘limlar">
  <div class="platform-nav-inner">
    <a class="brand" href={`${base}/dashboard`}>
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M9 10h6"/></svg>
      </span>
      <span><b>Ҳудудий марказлар</b><small>2026 · OpenPlan3D</small></span>
    </a>

    <div class="nav-links">
      {#each items as item}
        <a href={item.href} class:active={active === item.id}>
          {#if item.icon === 'dashboard'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          {:else if item.icon === 'map'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          {/if}
          <span>{item.label}</span>
        </a>
      {/each}
      {#if isAdmin}
        <a href={`${base}/admin`} class:active={active === 'admin'} class="admin-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.97 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.09A1.7 1.7 0 0 0 4.65 8.94a1.7 1.7 0 0 0-.34-1.88L4.25 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10.03 3H10V3h4v.09A1.7 1.7 0 0 0 15.03 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7.08l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>
          <span>Admin</span>
        </a>
      {/if}
    </div>
  </div>
</nav>

<style>
  .platform-nav{position:sticky;top:0;z-index:45;background:#0f1b2f;border-bottom:1px solid rgba(148,163,184,.14);box-shadow:0 8px 30px rgba(2,8,23,.18)}
  .platform-nav-inner{max-width:1480px;margin:0 auto;min-height:70px;padding:0 180px 0 24px;display:flex;align-items:center;gap:28px}
  .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;min-width:230px}
  .brand-mark{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#38bdf8);box-shadow:0 8px 24px rgba(37,99,235,.28)}
  .brand-mark svg{width:21px;height:21px}
  .brand span:last-child{display:flex;flex-direction:column;line-height:1.05}
  .brand b{font-size:14px;letter-spacing:.01em}
  .brand small{font-size:10px;color:#93a4bb;margin-top:5px;font-weight:600}
  .nav-links{display:flex;align-items:center;gap:6px;min-width:0;overflow-x:auto;scrollbar-width:none}
  .nav-links::-webkit-scrollbar{display:none}
  .nav-links a{height:40px;padding:0 13px;border-radius:10px;display:inline-flex;align-items:center;gap:8px;color:#9fb0c6;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap;border:1px solid transparent;transition:.16s ease}
  .nav-links a:hover{color:#fff;background:rgba(255,255,255,.06)}
  .nav-links a.active{color:#fff;background:#1e3a5f;border-color:#31547d;box-shadow:inset 0 0 0 1px rgba(96,165,250,.08)}
  .nav-links svg{width:17px;height:17px;flex:none}
  .nav-links .admin-link{color:#f6c86b}
  .nav-links .admin-link.active{background:#4a3516;border-color:#73511e;color:#ffe4a3}
  @media(max-width:900px){.platform-nav-inner{padding:0 14px;gap:14px}.brand{min-width:auto}.brand span:last-child{display:none}.nav-links a span{display:none}.nav-links a{width:42px;padding:0;justify-content:center}.nav-links{margin-right:80px}}
</style>
