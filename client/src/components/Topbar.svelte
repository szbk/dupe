<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  let search = "";
  export let placeholder = "Search files...";
  const onToggle = () => dispatch("toggleMenu");
</script>

<div class="topbar">
  <!-- Mobilde görünen hamburger -->
  <button class="menu-toggle" on:click={onToggle} aria-label="Toggle menu">
    <i class="fa-solid fa-bars"></i>
  </button>

  <div class="search">
    <i class="fa-solid fa-magnifying-glass"></i>
    <input placeholder={placeholder} bind:value={search} />
  </div>
</div>
