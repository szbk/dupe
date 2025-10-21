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
  const toggleMenu = () => {
    menuOpen = !menuOpen;
  };
</script>

{#if token}
  <Router>
    <div class="app">
      <Sidebar {menuOpen} />
      <div class="content">
        <Topbar on:toggleMenu={toggleMenu} />
        <Route path="/" component={Files} />
        <Route path="/files" component={Files} />
        <Route path="/transfers" component={Transfers} />
        <Route path="/sharing" component={Sharing} />
        <Route path="/trash" component={Trash} />
      </div>
      {#if menuOpen}
        <div
          class="backdrop show"
          on:click={() => {
            menuOpen = false;
          }}
        ></div>
      {/if}
    </div>
  </Router>
{:else}
  <Login />
{/if}
