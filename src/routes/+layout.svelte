<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { installUzbekUi } from '$lib/i18n/uz';
  import AuthGate from '$lib/components/AuthGate.svelte';
  import CadImportMenu from '$lib/components/CadImportMenu.svelte';
  import AppNav from '$lib/components/AppNav.svelte';

  onMount(() => installUzbekUi());

  let { children } = $props();
  let showProjectHomeNav = $derived(
    !page.url.pathname.includes('/editor') &&
    !page.url.pathname.includes('/dashboard') &&
    !page.url.pathname.includes('/map') &&
    !page.url.pathname.includes('/admin')
  );
</script>

<AuthGate>
  <CadImportMenu />
  {#if showProjectHomeNav}
    <AppNav active="projects" />
  {/if}
  {@render children()}
</AuthGate>