<script>
  import { Router, Route } from "svelte-routing";
  import Sidebar from "./components/Sidebar.svelte";
  import Topbar from "./components/Topbar.svelte";
  import Files from "./routes/Files.svelte";
  import Transfers from "./routes/Transfers.svelte";
  import Sharing from "./routes/Sharing.svelte";
  import Trash from "./routes/Trash.svelte";
  import Login from "./routes/Login.svelte";

  const token = localStorage.getItem("token");

  let menuOpen = false;

  // Menü aç/kapat (hamburger butonuyla)
  const toggleMenu = () => {
    menuOpen = !menuOpen;
  };

  // 🔹 Sidebar'ı kapatma fonksiyonu
  function closeSidebar() {
    menuOpen = false;
  }
</script>

{#if token}
  <Router>
    <div class="app">
      <!-- Sidebar -->
      <Sidebar {menuOpen} on:closeMenu={closeSidebar} />

      <!-- İçerik -->
      <div class="content">
        <Topbar on:toggleMenu={toggleMenu} />

        <Route path="/" component={Files} />
        <Route path="/files" component={Files} />
        <Route path="/transfers" component={Transfers} />
        <Route path="/sharing" component={Sharing} />
        <Route path="/trash" component={Trash} />
      </div>

      <!-- Sidebar dışına tıklayınca kapanma -->
      {#if menuOpen}
        <div class="backdrop show" on:click={closeSidebar}></div>
      {/if}
    </div>
  </Router>
{:else}
  <Login />
{/if}
