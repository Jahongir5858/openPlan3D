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
  let showPassword = $state(false);
  let capsLock = $state(false);
  let remember = $state(false);
  let success = $state(false);
  let usernameInvalid = $state(false);
  let passwordInvalid = $state(false);
  let confirmInvalid = $state(false);

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

  function validate() {
    usernameInvalid = username.trim().length < 3;
    passwordInvalid = password.length < 8;
    confirmInvalid = needsSetup && (confirmPassword.length < 8 || password !== confirmPassword);

    if (usernameInvalid) {
      error = username.trim() ? 'Login kamida 3 ta belgidan iborat bo‘lsin.' : 'Loginni kiriting.';
      return false;
    }
    if (passwordInvalid) {
      error = password ? 'Parol kamida 8 ta belgidan iborat bo‘lsin.' : 'Parolni kiriting.';
      return false;
    }
    if (confirmInvalid) {
      error = password !== confirmPassword ? 'Parollar bir xil emas.' : 'Parolni takrorlang.';
      return false;
    }
    return true;
  }

  async function submit() {
    error = '';
    if (!validate()) return;

    busy = true;
    try {
      const res = await fetch(needsSetup ? '/api/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'LOGIN_FAILED') {
          error = 'Login yoki parol xato. Qayta kiriting.';
          passwordInvalid = true;
        } else if (data.error === 'SETUP_ALREADY_DONE') {
          needsSetup = false;
          error = 'Administrator allaqachon yaratilgan. Login orqali kiring.';
        } else if (data.error === 'USERNAME_INVALID') {
          error = 'Login formati noto‘g‘ri.';
          usernameInvalid = true;
        } else if (data.error === 'PASSWORD_INVALID') {
          error = 'Parol talablarga mos emas.';
          passwordInvalid = true;
        } else {
          error = 'Amal bajarilmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring.';
        }
        return;
      }

      if (typeof localStorage !== 'undefined') {
        if (remember) localStorage.setItem('op3d_remember_username', username.trim());
        else localStorage.removeItem('op3d_remember_username');
      }

      setLocalUser(data.user);
      success = true;
      password = '';
      confirmPassword = '';
      await new Promise((resolve) => setTimeout(resolve, 450));
      user = data.user;
      needsSetup = false;
      success = false;
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
    confirmPassword = '';
    showPassword = false;
  }

  function handleCaps(e: KeyboardEvent) {
    capsLock = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
  }

  function forgotPassword(e: MouseEvent) {
    e.preventDefault();
    error = 'Parolni tiklash uchun markaz administratoriga murojaat qiling.';
  }

  onMount(() => {
    const remembered = localStorage.getItem('op3d_remember_username');
    if (remembered) {
      username = remembered;
      remember = true;
    }
    refresh();
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

{#if loading}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Yuklanmoqda…</p>
  </div>
{:else if user}
  <div class="user-chip">
    <span>{user.username}</span>
    <button onclick={logout}>Chiqish</button>
  </div>
  {@render children()}
{:else}
  <main class="auth-shell">
    <section class="viewport">
      <div class="glow" aria-hidden="true"></div>
      <div class="floor" aria-hidden="true"></div>

      <div class="model-wrap" aria-hidden="true">
        <svg class="model" viewBox="0 0 340 389">
          <path class="house shadow" d="M165.1 0.4 173.1 0 185.2 4.7 332 125.6 337.8 133.3 340 141.3 340 364.8 338.5 371.4 335.3 377.6 330.5 382.7 324.7 386.4 316.3 388.6 207.1 388.6 200.5 387.1 193.2 383.1 185.2 372.5 183.3 365.6 183.3 352.1 187.7 341.1 200.1 321.7 216.6 305.3 216.9 355.3 306.8 355 306.8 148.3 170.2 35.4 33.2 148.3 33.2 355 123.4 355.3 123.8 305.3 141.7 323.9 153.7 344 156.7 351.7 156.7 366.3 154.5 373.6 146.4 383.5 140.6 386.7 132.9 388.6 24.1 388.6 16.4 386.7 10.6 383.5 5.1 378 2.2 372.9 0 363 0 143.5 1.8 134.4 9.5 124.5 158.5 2.6Z"/>
          <path class="leaf" d="M273.2 206 276.1 211.1 277.2 216.6 277.2 222.4 276.1 229.3 272.8 240.3 270.6 245.8 265.1 256.4 255.6 269.5 244.3 281.2 215.8 305.3 202 319.2 196.1 326.5 191.7 333.1 185.5 345.1 183.3 351.7 183.3 280.1 183.7 279.7 184.1 273.9 185.5 267.3 188.1 260.4 190.3 256 193.9 250.2 202 240.3 222.4 220.2 235.6 209.6 242.5 205.2 247.6 202.7 254.5 200.5 262.6 200.1 268.8 202.3Z"/>
          <path class="leaf" d="M77.4 200.1 85.8 200.5 92.4 202.7 99 206 104.1 209.3 111.8 215.1 120.9 223.1 138.8 241 143.2 246.1 149 254.5 152.7 261.8 154.5 267 156.7 278.6 156.7 351.3 154.1 344 150.1 336 144.3 326.9 138.8 319.9 126.7 307.5 98.6 283.8 88.7 274.3 81.8 266.2 74.1 254.9 69 244.7 65.4 234.5 63.5 226.8 63.2 220.9 62.8 220.6 63.2 214.7 64.6 209.6 67.6 205.2 71.9 202Z"/>
          <path class="head" d="M173.8 151.6 174.2 151.9 176.4 151.9 179.7 152.7 188.4 156.3 193.2 159.6 198.3 164.7 201.6 169.5 204.5 175.7 206.3 183.3 206.3 192.8 205.2 197.9 202.3 205.2 198.7 210.7 195 214.7 187.3 220.2 180 223.1 174.9 224.2 165.4 224.2 160 223.1 156.7 222 151.6 219.5 146.8 216.2 141.7 211.1 138.4 206.3 136.2 202 134 194.3 134 192.1 133.7 191.7 133.7 184.1 135.1 177.1 138 170.2 142.4 164 146.1 160.3 152.3 155.9 159.2 153 166.2 151.6Z"/>
        </svg>
      </div>

      <div class="vp-text">
        <div class="brand-lockup">
          <svg viewBox="0 0 340 389" aria-hidden="true">
            <path class="house" d="M165.1 0.4 173.1 0 185.2 4.7 332 125.6 337.8 133.3 340 141.3 340 364.8 338.5 371.4 335.3 377.6 330.5 382.7 324.7 386.4 316.3 388.6 207.1 388.6 200.5 387.1 193.2 383.1 185.2 372.5 183.3 365.6 183.3 352.1 187.7 341.1 200.1 321.7 216.6 305.3 216.9 355.3 306.8 355 306.8 148.3 170.2 35.4 33.2 148.3 33.2 355 123.4 355.3 123.8 305.3 141.7 323.9 153.7 344 156.7 351.7 156.7 366.3 154.5 373.6 146.4 383.5 140.6 386.7 132.9 388.6 24.1 388.6 16.4 386.7 10.6 383.5 5.1 378 2.2 372.9 0 363 0 143.5 1.8 134.4 9.5 124.5 158.5 2.6Z"/>
            <path class="leaf" d="M273.2 206 276.1 211.1 277.2 216.6 277.2 222.4 276.1 229.3 272.8 240.3 270.6 245.8 265.1 256.4 255.6 269.5 244.3 281.2 215.8 305.3 202 319.2 196.1 326.5 191.7 333.1 185.5 345.1 183.3 351.7 183.3 280.1 183.7 279.7 184.1 273.9 185.5 267.3 188.1 260.4 190.3 256 193.9 250.2 202 240.3 222.4 220.2 235.6 209.6 242.5 205.2 247.6 202.7 254.5 200.5 262.6 200.1 268.8 202.3Z"/>
            <path class="leaf" d="M77.4 200.1 85.8 200.5 92.4 202.7 99 206 104.1 209.3 111.8 215.1 120.9 223.1 138.8 241 143.2 246.1 149 254.5 152.7 261.8 154.5 267 156.7 278.6 156.7 351.3 154.1 344 150.1 336 144.3 326.9 138.8 319.9 126.7 307.5 98.6 283.8 88.7 274.3 81.8 266.2 74.1 254.9 69 244.7 65.4 234.5 63.5 226.8 63.2 220.9 62.8 220.6 63.2 214.7 64.6 209.6 67.6 205.2 71.9 202Z"/>
            <path class="head" d="M173.8 151.6 174.2 151.9 176.4 151.9 179.7 152.7 188.4 156.3 193.2 159.6 198.3 164.7 201.6 169.5 204.5 175.7 206.3 183.3 206.3 192.8 205.2 197.9 202.3 205.2 198.7 210.7 195 214.7 187.3 220.2 180 223.1 174.9 224.2 165.4 224.2 160 223.1 156.7 222 151.6 219.5 146.8 216.2 141.7 211.1 138.4 206.3 136.2 202 134 194.3 134 192.1 133.7 191.7 133.7 184.1 135.1 177.1 138 170.2 142.4 164 146.1 160.3 152.3 155.9 159.2 153 166.2 151.6Z"/>
          </svg>
          <strong>HUDUDIY IJTIMOIY<br />XIZMATLAR MARKAZI</strong>
        </div>
        <div class="vp-rule"></div>
        <h2>Bino rejalari bitta joyda</h2>
        <p>Markaz obyektlarining 2D rejalarini chizing, 3D da tekshiring va hamkasblaringizga uzating.</p>
      </div>
    </section>

    <section class="pane">
      <div class="form-col">
        {#if success}
          <div class="done">
            <div class="tick">✓</div>
            <h2>Xush kelibsiz</h2>
            <p>Tizim yuklanmoqda…</p>
          </div>
        {:else}
          <h1>{needsSetup ? 'Administrator hisobini yaratish' : 'Tizimga kirish'}</h1>
          <p class="lede">{needsSetup ? 'Birinchi administrator hisobini yarating.' : 'Rejalaringiz bilan ishlash uchun hisobingizga kiring.'}</p>

          {#if error}
            <div class="alert" role="alert">{error}</div>
          {/if}

          <form onsubmit={(e) => { e.preventDefault(); submit(); }} novalidate>
            <div class="field" class:invalid={usernameInvalid}>
              <label for="username">Login</label>
              <input id="username" bind:value={username} type="text" autocomplete="username" spellcheck="false" autocapitalize="none" placeholder="ism.familiya" oninput={() => { usernameInvalid = false; error = ''; }} />
              <p class="hint">{username.trim() ? 'Login kamida 3 ta belgidan iborat bo‘lsin.' : 'Loginni kiriting.'}</p>
            </div>

            <div class="field" class:invalid={passwordInvalid}>
              <label for="password">Parol</label>
              <div class="input-shell">
                <input id="password" bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete={needsSetup ? 'new-password' : 'current-password'} placeholder="••••••••" oninput={() => { passwordInvalid = false; error = ''; }} onkeydown={handleCaps} onkeyup={handleCaps} onblur={() => capsLock = false} />
                <button type="button" class="peek" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ochish'}>
                  {#if showPassword}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.2 6.4A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.3-1"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  {/if}
                </button>
              </div>
              <p class="hint">{password ? 'Parol kamida 8 ta belgidan iborat bo‘lsin.' : 'Parolni kiriting.'}</p>
              {#if capsLock}<p class="caps">Caps Lock yoqilgan.</p>{/if}
            </div>

            {#if needsSetup}
              <div class="field" class:invalid={confirmInvalid}>
                <label for="confirm-password">Parolni takrorlang</label>
                <input id="confirm-password" bind:value={confirmPassword} type={showPassword ? 'text' : 'password'} autocomplete="new-password" placeholder="••••••••" oninput={() => { confirmInvalid = false; error = ''; }} />
                <p class="hint">Parollar bir xil bo‘lishi kerak.</p>
              </div>
            {:else}
              <div class="row">
                <label class="remember"><input type="checkbox" bind:checked={remember} /> Meni eslab qol</label>
                <a href="/" onclick={forgotPassword}>Parolni unutdingizmi?</a>
              </div>
            {/if}

            <button type="submit" class="submit" disabled={busy}>
              {busy ? 'Tekshirilmoqda…' : needsSetup ? 'Administrator yaratish' : 'Kirish'}
            </button>
          </form>

          <p class="foot">Loyihalar <b>Cloudflare D1</b> bulut bazasida saqlanadi va brauzerda lokal zaxira nusxasi ham qoladi.</p>
        {/if}
      </div>
    </section>
  </main>
{/if}

<style>
  :global(body) { margin: 0; }
  .loading-screen {
    min-height: 100vh; display: grid; place-items: center; background: #02182e;
    color: white; font: 500 14px Manrope, system-ui, sans-serif; text-align: center;
  }
  .spinner {
    width: 38px; height: 38px; margin: 0 auto 14px; border-radius: 50%;
    border: 4px solid rgba(255,255,255,.18); border-top-color: white; animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .user-chip {
    position: fixed; top: 12px; right: 12px; z-index: 9999; display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
    background: rgba(15,23,42,.9); color: white; box-shadow: 0 8px 24px rgba(0,0,0,.18);
    backdrop-filter: blur(10px); font: 500 12px Manrope, system-ui, sans-serif;
  }
  .user-chip span { opacity: .72; }
  .user-chip button { border: 0; border-radius: 7px; padding: 5px 8px; background: rgba(255,255,255,.1); color: white; cursor: pointer; font-weight: 700; }

  .auth-shell {
    --navy-900:#02182e; --navy-800:#042c53; --navy-700:#073f70; --teal:#2bb3c4;
    --teal-ink:#026d7a; --green:#7cc45c; --green-ink:#5e8c47; --sheet:#fff; --wash:#f4f6f8;
    --ink:#0a1f36; --ink-2:#55677d; --ink-3:#8d9cad; --line:#e2e7ec; --danger:#c0392b;
    min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 1.15fr 1fr;
    font-family: Manrope, "Noto Sans", system-ui, -apple-system, sans-serif; color: var(--ink); background: white;
  }

  .viewport {
    position: relative; overflow: hidden; isolation: isolate; display: flex; flex-direction: column;
    justify-content: flex-end; padding: 56px; background:
      radial-gradient(120% 90% at 68% 30%, #0a3a68 0%, transparent 62%),
      linear-gradient(160deg, #042c53 0%, #02182e 78%);
  }
  .floor {
    position:absolute; left:-30%; right:-30%; bottom:-8%; height:62%; z-index:0; opacity:.5;
    background-image:linear-gradient(rgba(43,179,196,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(43,179,196,.3) 1px,transparent 1px);
    background-size:56px 56px; transform:perspective(520px) rotateX(66deg); transform-origin:bottom center;
    mask-image:linear-gradient(to top,#000 4%,transparent 82%);
  }
  .glow {
    position:absolute; width:60%; aspect-ratio:1; left:22%; top:8%; z-index:0;
    background:radial-gradient(circle,rgba(43,179,196,.22),transparent 66%); filter:blur(28px);
  }
  .model-wrap { position:absolute; inset:0; z-index:1; display:grid; place-items:center; padding-bottom:12%; }
  .model { width:min(64%,460px); height:auto; overflow:visible; transform:rotate(-1.5deg); filter:drop-shadow(18px 22px 0 rgba(0,18,36,.32)) drop-shadow(0 0 18px rgba(43,179,196,.2)); animation:float 5s ease-in-out infinite; }
  .house { fill:#eaf3f8; stroke:#fff; stroke-width:1.4; stroke-linejoin:round; }
  .leaf { fill:#5e8c47; stroke:#9ada74; stroke-width:1.4; }
  .head { fill:#026d7a; stroke:#56d2e1; stroke-width:1.4; }
  @keyframes float { 0%,100%{transform:rotate(-1.5deg) translateY(0)} 50%{transform:rotate(-1.5deg) translateY(-8px)} }

  .vp-text { position:relative; z-index:2; max-width:34ch; }
  .brand-lockup { display:flex; align-items:center; gap:13px; margin-bottom:24px; }
  .brand-lockup svg { width:47px; height:54px; flex:0 0 auto; }
  .brand-lockup strong { color:#eef6fa; font-size:14px; line-height:1.16; letter-spacing:.015em; }
  .vp-rule { width:46px; height:3px; border-radius:2px; background:linear-gradient(90deg,var(--teal),var(--green)); margin-bottom:24px; }
  .vp-text h2 { margin:0 0 12px; color:#eef6fa; font-size:clamp(26px,2.5vw,36px); font-weight:800; line-height:1.14; letter-spacing:-.028em; }
  .vp-text p { margin:0; color:#9fbdd2; font-size:15.5px; line-height:1.6; }

  .pane { display:grid; place-items:center; padding:48px 40px; background:white; }
  .form-col { width:100%; max-width:372px; }
  .form-col h1 { margin:0 0 8px; font-size:30px; font-weight:800; letter-spacing:-.032em; line-height:1.15; }
  .lede { margin:0 0 30px; font-size:15px; line-height:1.55; color:var(--ink-2); }
  .field { margin-bottom:16px; }
  .field label { display:block; margin-bottom:7px; font-size:13.5px; font-weight:600; }
  .input-shell { position:relative; }
  .field input[type="text"], .field input[type="password"] {
    width:100%; box-sizing:border-box; font:500 15px Manrope,system-ui,sans-serif; color:var(--ink);
    background:var(--wash); border:1.5px solid transparent; border-radius:11px; padding:13px 15px;
    transition:background .14s,border-color .14s,box-shadow .14s;
  }
  #password { padding-right:48px; }
  .field input::placeholder { color:var(--ink-3); font-weight:400; }
  .field input:hover:not(:focus) { background:#eef1f5; }
  .field input:focus { outline:none; background:white; border-color:var(--teal-ink); box-shadow:0 0 0 4px rgba(2,109,122,.13); }
  .field.invalid input { border-color:var(--danger); background:#fdf4f3; box-shadow:0 0 0 4px rgba(192,57,43,.1); }
  .hint { display:none; margin:7px 0 0; color:var(--danger); font-size:12.5px; line-height:1.4; }
  .field.invalid .hint { display:block; }
  .caps { margin:7px 0 0; color:var(--ink-2); font-size:12.5px; }

  .peek {
    position:absolute; right:6px; top:50%; transform:translateY(-50%); width:38px; height:38px;
    display:grid; place-items:center; border:0; border-radius:9px; background:none; color:var(--ink-3); cursor:pointer;
  }
  .peek:hover { background:rgba(10,31,54,.05); color:var(--ink-2); }
  .peek svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

  .row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:20px 0 24px; font-size:13.5px; }
  .remember { display:inline-flex; align-items:center; gap:9px; color:var(--ink-2); cursor:pointer; font-weight:500; }
  .remember input { width:16px; height:16px; margin:0; accent-color:var(--teal-ink); cursor:pointer; }
  .row a { color:var(--teal-ink); text-decoration:none; font-weight:600; }
  .row a:hover { text-decoration:underline; text-underline-offset:3px; }

  .submit {
    width:100%; border:0; border-radius:11px; padding:15px; color:white; background:var(--navy-800);
    font:700 15.5px Manrope,system-ui,sans-serif; cursor:pointer; transition:background .14s,transform .08s;
  }
  .submit:hover:not(:disabled) { background:var(--navy-700); }
  .submit:active:not(:disabled) { transform:translateY(1px); }
  .submit:disabled { background:#6b7d92; cursor:default; }

  .alert { margin-bottom:20px; padding:12px 14px; border-radius:11px; background:#fdf1ef; color:#8c2a1e; font-size:13.5px; line-height:1.5; font-weight:500; }
  .foot { margin:26px 0 0; padding-top:18px; border-top:1px solid var(--line); color:var(--ink-3); font-size:12.5px; line-height:1.6; }
  .foot b { color:var(--ink-2); font-weight:600; }

  .done { text-align:center; padding:8px 0; }
  .tick { width:56px; height:56px; margin:0 auto 20px; display:grid; place-items:center; border-radius:50%; background:rgba(94,140,71,.12); color:var(--green-ink); font-size:28px; font-weight:800; }
  .done h2 { margin:0 0 8px; font-size:22px; font-weight:800; }
  .done p { margin:0; color:var(--ink-2); font-size:14.5px; }

  :focus-visible { outline:2.5px solid var(--teal-ink); outline-offset:2px; }

  @media (max-width:940px) {
    .auth-shell { grid-template-columns:1fr; }
    .viewport { min-height:280px; padding:34px; }
    .model-wrap { padding-bottom:4%; padding-left:34%; }
    .model { width:78%; max-height:240px; }
    .vp-text h2 { font-size:24px; }
    .vp-text p { font-size:14px; }
    .pane { padding:40px 28px 56px; }
  }
  @media (max-width:620px) {
    .viewport { min-height:210px; padding:26px; }
    .model-wrap { padding-left:42%; padding-bottom:0; }
    .vp-text p { display:none; }
    .brand-lockup strong { font-size:11px; }
    .brand-lockup svg { width:38px; height:44px; }
    .form-col h1 { font-size:26px; }
  }
  @media (prefers-reduced-motion:reduce) {
    .model { animation:none; }
    * { transition-duration:.01ms !important; }
  }
</style>
