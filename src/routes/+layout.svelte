<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { installUzbekUi } from '$lib/i18n/uz';
  import AuthGate from '$lib/components/AuthGate.svelte';
  import CadImportBridge from '$lib/components/CadImportBridge.svelte';

  onMount(() => installUzbekUi());

  let { children } = $props();
</script>

<AuthGate>
  <CadImportBridge />
  {@render children()}
</AuthGate>
