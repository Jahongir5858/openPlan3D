<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { themePreference } from '$lib/stores/theme';
  import { installUzbekUi } from '$lib/i18n/uz';
  import AuthGate from '$lib/components/AuthGate.svelte';

  onMount(() => installUzbekUi());

  let { children } = $props();
</script>

<AuthGate>
  {@render children()}
</AuthGate>
