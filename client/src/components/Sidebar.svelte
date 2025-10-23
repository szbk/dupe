<script>
  import { Link } from "svelte-routing";
  import { createEventDispatcher } from "svelte";

  export let menuOpen = false;
  const dispatch = createEventDispatcher();

  // Menü öğesine tıklanınca sidebar'ı kapat
  function handleLinkClick() {
    dispatch("closeMenu");
  }
</script>

<div class="sidebar" class:open={menuOpen}>
  <div class="logo">du.pe</div>

  <div class="menu">
    <Link
      to="/"
      class="item"
      getProps={({ isCurrent }) => ({
        class: isCurrent ? "item active" : "item",
      })}
      on:click={handleLinkClick}
    >
      <i class="fa-solid fa-folder icon"></i>
      Files
    </Link>

    <Link
      to="/transfers"
      class="item"
      getProps={({ isCurrent }) => ({
        class: isCurrent ? "item active" : "item",
      })}
      on:click={handleLinkClick}
    >
      <i class="fa-solid fa-arrow-down icon"></i>
      Transfers
    </Link>

    <Link
      to="/sharing"
      class="item"
      getProps={({ isCurrent }) => ({
        class: isCurrent ? "item active" : "item",
      })}
      on:click={handleLinkClick}
    >
      <i class="fa-solid fa-share-nodes icon"></i>
      Sharing
    </Link>

    <Link
      to="/trash"
      class="item"
      getProps={({ isCurrent }) => ({
        class: isCurrent ? "item active" : "item",
      })}
      on:click={handleLinkClick}
    >
      <i class="fa-solid fa-trash icon"></i>
      Trash
    </Link>
  </div>
</div>
