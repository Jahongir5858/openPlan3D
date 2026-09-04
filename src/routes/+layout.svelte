<script>
  import '../app.css';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { themePreference } from '$lib/stores/theme';
  import { installUzbekUi } from '$lib/i18n/uz';

  onMount(() => {
    import('$lib/firebase');
    return installUzbekUi();
  });

  let { children } = $props();
</script>

{@render children()}
