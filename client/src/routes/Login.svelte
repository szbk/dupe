<script>
  import { API } from "../utils/api.js"; 
  import logo from "../assets/image/logo.png";

  let username = "";
  let password = "";
  let error = "";

  async function login() {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const { token } = await res.json();
      localStorage.setItem("token", token);
      window.location.reload();
    } else {
      error = "Kullanıcı adı veya şifre hatalı.";
    }
  }
</script>

<div class="login">
  <div class="logo-box">
    <img src={logo} alt="du.pe logo" class="logo" />
  </div>

  <div class="box">
    <form on:submit|preventDefault={login}>
      <h2>Welcome to <span>du.pe</span></h2>
      <input placeholder="Username" bind:value={username} />
      <input type="password" placeholder="Password" bind:value={password} />
      <button type="submit">Login</button>
      {#if error}<p class="error">{error}</p>{/if}
    </form>
  </div>
</div>

<style>
  :root {
    --yellow: #fdce45;
    --yellow-light: #fdce45;
    --red: #e24b2d;
    --beige: #f9f6ef;
    --gray-light: #ffffff;
    --gray-border: #ddd;
    --text-dark: #333;
  }

  .login {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: "Inter", sans-serif;
    background: var(--beige);
    color: var(--text-dark);
  }

  .logo-box {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 25px;
  }

  .logo {
    width: 180px;
    height: 180px;
    transition: transform 0.3s ease;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
  }

  .logo:hover {
    transform: scale(1.08);
  }

  .box {
    background: var(--gray-light);
    border: 1px solid var(--gray-border);
    border-radius: 14px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
    padding: 30px 25px;
    width: 300px;
    transition: box-shadow 0.2s ease;
  }

  .box:hover {
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
  }

  h2 {
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 20px;
    color: var(--text-dark);
  }

  h2 span {
    color: var(--yellow);
  }

  input {
    width: 100%;
    padding: 10px;
    margin: 8px 0;
    border-radius: 8px;
    border: 1px solid #ccc;
    background: #fafafa;
    color: var(--text-dark);
    font-size: 14px;
    outline: none;
    transition: border 0.2s ease, box-shadow 0.2s ease;
  }

  input:focus {
    border-color: var(--yellow);
    box-shadow: 0 0 0 3px rgba(245, 179, 51, 0.2);
  }

  button {
    width: 100%;
    padding: 10px;
    margin-top: 12px;
    background: #fdce45;
    border: none;
    color: #000;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    transition: all 0.2s ease;
  }

  button:hover {
    background: var(--yellow-light);
    transform: translateY(-1px);
  }

  .error {
    color: var(--red);
    font-size: 13px;
    text-align: center;
    margin-top: 10px;
  }

  @media (max-width: 480px) {
    .box {
      width: 85%;
      padding: 25px 20px;
    }
    .logo {
      width: 120px;
      height: 120px;
    }
    h2 {
      font-size: 18px;
    }
  }
</style>
