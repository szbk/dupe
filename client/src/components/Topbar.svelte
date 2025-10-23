<script>
  import { createEventDispatcher, onMount } from "svelte";
  const dispatch = createEventDispatcher();

  let search = "";
  export let placeholder = "Search files...";

  const onToggle = () => dispatch("toggleMenu");
</script>

<div class="topbar">
  <!-- 🔹 Hamburger butonu sadece küçük ekranlarda gösterilir -->
  <button
    class="menu-toggle"
    on:click={onToggle}
    aria-label="Toggle menu"
  >
    <i class="fa-solid fa-bars"></i>
  </button>

  <div class="search">
    <i class="fa-solid fa-magnifying-glass"></i>
    <input placeholder={placeholder} bind:value={search} />
  </div>
</div>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f8f8f8;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
  }

  .search input {
    border: none;
    outline: none;
    background: transparent;
    flex: 1;
  }

  /* 🟡 Hamburger sadece küçük ekranlarda görünsün */
  .menu-toggle {
    display: none;
    background: none;
    border: none;
    font-size: 20px;
    color: #333;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .menu-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
    }
  }
</style>
