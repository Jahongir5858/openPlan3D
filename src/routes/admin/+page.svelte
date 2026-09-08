<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import AppNav from '$lib/components/AppNav.svelte';

  type AdminUser = { id: number; username: string; role: 'admin' | 'user'; createdAt: number; projectCount: number };
  type AdminProject = { userId: number; username: string; id: string; name: string; updatedAt: string };

  let loading = $state(true);
  let allowed = $state(false);
  let users = $state<AdminUser[]>([]);
  let projects = $state<AdminProject[]>([]);
  let overview = $state({ users: 0, projects: 0, centers: 20 });
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let currentUserId = $state<number | null>(null);

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `API ${res.status}`), { code: data?.error });
    return data;
  }

  async function refresh() {
    const [o, u, p] = await Promise.all([
      api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/projects')
    ]);
    overview = o;
    users = u;
    projects = p;
  }

  onMount(async () => {
    try {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const me = meRes.ok ? await meRes.json() : null;
      currentUserId = Number(me?.user?.id || 0) || null;
      if (!(me?.user?.role === 'admin' || Number(me?.user?.id) === 1)) {
        goto(`${base}/dashboard`);
        return;
      }
      allowed = true;
      await refresh();
    } catch (e) {
      error = 'Administrator ma’lumotlarini yuklab bo‘lmadi.';
    } finally {
      loading = false;
    }
  });

  async function createUser() {
    error = ''; message = '';
    if (username.trim().length < 3) { error = 'Login kamida 3 ta belgidan iborat bo‘lsin.'; return; }
    if (password.length < 8) { error = 'Parol kamida 8 ta belgidan iborat bo‘lsin.'; return; }
    busy = true;
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
      message = `${username.trim()} foydalanuvchisi yaratildi.`;
      username = ''; password = '';
      await refresh();
    } catch (e: any) {
      error = e?.code === 'USERNAME_EXISTS' ? 'Bu login allaqachon mavjud.' : 'Foydalanuvchi yaratilmadi.';
    } finally { busy = false; }
  }

  async function removeUser(user: AdminUser) {
    if (user.id === 1 || user.id === currentUserId) return;
    if (!confirm(`“${user.username}” foydalanuvchisini o‘chirasizmi? Uning barcha loyihalari ham o‘chadi.`)) return;
    try { await api(`/api/admin/users/${user.id}`, { method: 'DELETE' }); await refresh(); }
    catch { error = 'Foydalanuvchini o‘chirib bo‘lmadi.'; }
  }

  async function resetPassword(user: AdminUser) {
    const next = prompt(`${user.username} uchun yangi parol (kamida 8 belgi):`);
    if (!next) return;
    if (next.length < 8) { error = 'Parol kamida 8 ta belgidan iborat bo‘lsin.'; return; }
    try { await api(`/api/admin/users/${user.id}/password`, { method: 'PUT', body: JSON.stringify({ password: next }) }); message = `${user.username} paroli yangilandi.`; }
    catch { error = 'Parolni yangilab bo‘lmadi.'; }
  }

  async function removeProject(project: AdminProject) {
    if (!confirm(`“${project.name || 'Nomsiz loyiha'}” loyihasini o‘chirasizmi?`)) return;
    try { await api(`/api/admin/projects/${project.userId}/${encodeURIComponent(project.id)}`, { method: 'DELETE' }); await refresh(); }
    catch { error = 'Loyihani o‘chirib bo‘lmadi.'; }
  }

  function formatDate(value: number | string) {
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    return new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }
</script>

<svelte:head><title>Admin · Hududiy markazlar</title></svelte:head>

<div class="page-shell">
  <AppNav active="admin" />
  {#if loading}
    <div class="loading">Administrator paneli yuklanmoqda…</div>
  {:else if allowed}
    <main class="admin-wrap">
      <section class="hero">
        <div><span class="eyebrow">ADMINISTRATOR</span><h1>Tizim boshqaruvi</h1><p>Foydalanuvchilar, loyihalar va 2026-yilgi markazlar bo‘yicha markazlashtirilgan boshqaruv.</p></div>
        <a href={`${base}/dashboard`}>Dashboardga qaytish</a>
      </section>

      <section class="kpis">
        <div><span>Foydalanuvchilar</span><b>{overview.users}</b></div>
        <div><span>Barcha loyihalar</span><b>{overview.projects}</b></div>
        <div><span>2026 markazlari</span><b>{overview.centers}</b></div>
        <div><span>Administratorlar</span><b>1</b></div>
      </section>

      {#if message}<div class="notice success">{message}</div>{/if}
      {#if error}<div class="notice error">{error}</div>{/if}

      <section class="admin-grid">
        <div class="panel users-panel">
          <div class="panel-head"><div><span class="label">FOYDALANUVCHILAR</span><h2>Kirish huquqlari</h2></div><span>{users.length} ta</span></div>
          <form class="create-user" onsubmit={(e) => { e.preventDefault(); createUser(); }}>
            <label><span>Yangi login</span><input bind:value={username} autocomplete="off" placeholder="viloyat_operatori" /></label>
            <label><span>Vaqtinchalik parol</span><input bind:value={password} type="password" autocomplete="new-password" placeholder="kamida 8 belgi" /></label>
            <button disabled={busy}>{busy ? 'Yaratilmoqda…' : '+ Foydalanuvchi yaratish'}</button>
          </form>

          <div class="table-wrap">
            <table>
              <thead><tr><th>Login</th><th>Rol</th><th>Loyihalar</th><th>Yaratilgan</th><th></th></tr></thead>
              <tbody>
                {#each users as u}
                  <tr>
                    <td><b>{u.username}</b>{#if u.id === currentUserId}<small>Joriy hisob</small>{/if}</td>
                    <td><span class:admin={u.role === 'admin'} class="role">{u.role === 'admin' ? 'Administrator' : 'Foydalanuvchi'}</span></td>
                    <td>{u.projectCount}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td class="actions"><button onclick={() => resetPassword(u)}>Parol</button>{#if u.id !== 1 && u.id !== currentUserId}<button class="danger" onclick={() => removeUser(u)}>O‘chirish</button>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel audit-panel">
          <div class="panel-head"><div><span class="label">XAVFSIZLIK</span><h2>Admin qoidalari</h2></div></div>
          <ul>
            <li><b>Asosiy administrator</b><span>ID 1 hisob o‘chirilmaydi va Admin bo‘limiga yagona to‘liq kirish huquqiga ega.</span></li>
            <li><b>Foydalanuvchi izolatsiyasi</b><span>Har bir foydalanuvchi faqat o‘zining bino reja loyihalarini ochadi va tahrirlaydi.</span></li>
            <li><b>Parol xavfsizligi</b><span>Parollar PBKDF2-SHA256 orqali individual salt bilan saqlanadi.</span></li>
            <li><b>Sessiya</b><span>HttpOnly, Secure va SameSite cookie ishlatiladi.</span></li>
          </ul>
        </div>
      </section>

      <section class="panel projects-panel">
        <div class="panel-head"><div><span class="label">LOYIHALAR</span><h2>Barcha foydalanuvchilar loyihalari</h2></div><span>{projects.length} ta</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Loyiha</th><th>Foydalanuvchi</th><th>Yangilangan</th><th>ID</th><th></th></tr></thead>
            <tbody>
              {#each projects as p}
                <tr>
                  <td><b>{p.name || 'Nomsiz loyiha'}</b></td><td>{p.username}</td><td>{formatDate(p.updatedAt)}</td><td><code>{p.id}</code></td>
                  <td class="actions">{#if p.userId === currentUserId}<a href={`${base}/editor?id=${p.id}`}>Ochish</a>{/if}<button class="danger" onclick={() => removeProject(p)}>O‘chirish</button></td>
                </tr>
              {/each}
              {#if projects.length === 0}<tr><td colspan="5" class="empty">Hozircha loyiha yo‘q.</td></tr>{/if}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  {/if}
</div>

<style>
  :global(body){margin:0;background:#0b1423;color:#e5edf7;font-family:Manrope,system-ui,sans-serif}.page-shell{min-height:100vh;background:radial-gradient(circle at 80% -10%,rgba(245,158,11,.08),transparent 28%),#0b1423}.loading{padding:100px 20px;text-align:center;color:#8294aa}.admin-wrap{max-width:1480px;margin:auto;padding:28px 24px 52px}.hero{border:1px solid #2c3b4e;background:linear-gradient(135deg,#172337,#141d2b);border-radius:19px;padding:25px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.eyebrow,.label{font-size:9px;color:#f4bd5e;letter-spacing:.14em;font-weight:800}.hero h1{margin:6px 0;font-size:26px;color:#fff}.hero p{margin:0;color:#8da0b8;font-size:12px}.hero a{padding:10px 13px;border:1px solid #3a4c63;border-radius:9px;color:#d8e4f2;text-decoration:none;font-size:10px;font-weight:800}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:15px 0}.kpis>div{padding:16px 18px;background:#101d2e;border:1px solid #223249;border-radius:14px;display:flex;flex-direction:column}.kpis span{font-size:10px;color:#7f93aa}.kpis b{font-size:25px;color:#fff;margin-top:5px}.notice{padding:10px 13px;border-radius:9px;margin:10px 0;font-size:11px;font-weight:700}.notice.success{background:#0f3124;border:1px solid #235c43;color:#7de5ae}.notice.error{background:#391a20;border:1px solid #6a2934;color:#ff9baa}.admin-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:14px}.panel{background:#101d2e;border:1px solid #223249;border-radius:16px;padding:16px;min-width:0}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.panel-head h2{font-size:15px;margin:4px 0 0;color:#fff}.panel-head>span{font-size:10px;color:#6f849e}.create-user{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;padding:12px;background:#0c1827;border:1px solid #1e3046;border-radius:11px;margin-bottom:12px}.create-user label{display:grid;gap:5px}.create-user label span{font-size:8px;color:#71869e;font-weight:800;text-transform:uppercase}.create-user input{border:1px solid #2a3d55;background:#0a1523;color:#eaf2fc;border-radius:8px;padding:9px 10px;outline:none;font:600 10px Manrope,system-ui}.create-user button{height:36px;border:0;border-radius:8px;background:#2563eb;color:#fff;padding:0 12px;font-size:9px;font-weight:800;cursor:pointer}.create-user button:disabled{opacity:.55}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:680px}th,td{text-align:left;border-bottom:1px solid #1d2b3d;padding:10px 9px;font-size:9.5px;color:#8fa2b8}th{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#5f748d}td b{color:#e8f1fc;font-size:10.5px}td small{display:block;color:#53708e;font-size:8px;margin-top:3px}.role{padding:4px 7px;border-radius:999px;background:#172a42;color:#79a9e8;font-size:8px;font-weight:800}.role.admin{background:#423116;color:#ffd784}.actions{white-space:nowrap;text-align:right}.actions button,.actions a{border:1px solid #2a3d55;background:#14243a;color:#9fb4ce;border-radius:7px;padding:6px 8px;font-size:8px;font-weight:800;cursor:pointer;text-decoration:none;margin-left:4px}.actions .danger{border-color:#542832;background:#2d1820;color:#ef9aaa}.audit-panel ul{list-style:none;padding:0;margin:0}.audit-panel li{padding:11px 4px;border-bottom:1px solid #1d2b3d;display:flex;flex-direction:column;gap:4px}.audit-panel li b{font-size:10px;color:#e7eef8}.audit-panel li span{font-size:9px;color:#70849c;line-height:1.5}.projects-panel{margin-top:14px}.projects-panel code{font-size:8px;color:#7692b2}.empty{text-align:center!important;padding:30px!important;color:#60748c!important}
  @media(max-width:1000px){.kpis{grid-template-columns:repeat(2,1fr)}.admin-grid{grid-template-columns:1fr}.create-user{grid-template-columns:1fr 1fr}.create-user button{grid-column:1/-1}}
  @media(max-width:600px){.admin-wrap{padding:14px 10px 36px}.hero{align-items:flex-start;flex-direction:column;padding:19px}.hero h1{font-size:22px}.kpis{gap:8px}.kpis>div{padding:12px}.create-user{grid-template-columns:1fr}.create-user button{grid-column:auto}.panel{padding:11px}}
</style>
