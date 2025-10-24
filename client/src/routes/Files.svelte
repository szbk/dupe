<script>
  import { onMount, tick } from "svelte";
  import { API, apiFetch } from "../utils/api.js";
  import { cleanFileName } from "../utils/filename.js";

  let files = [];
  let showModal = false;
  let selectedVideo = null;
  let subtitleURL = null;
  let subtitleLang = "en";
  let subtitleLabel = "Custom Subtitles";

  // 🎬 Player kontrolleri
  let videoEl;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let currentIndex;

  let showImageModal = false;
  let selectedImage = null;

  // ✅ REACTIVE: selectedVideo güvenli kullanımlar
  $: selectedName = selectedVideo?.name ?? "";
  $: encName = encodeURIComponent(selectedName);

  // ✅ Token'lı video URL'ini fonksiyonla üret (başta çağrılmasın)
  function getVideoURL() {
    if (!selectedName) return "";
    const token = localStorage.getItem("token");
    return `${API}/media/${encName}?token=${token}`;
  }

  // 📂 Dosyaları yükle (tokenlı)
  async function loadFiles() {
    const r = await apiFetch("/api/files");
    if (!r.ok) return;
    files = await r.json();
  }

  function formatSize(bytes) {
    if (!bytes) return "0 MB";
    if (bytes < 1e6) return (bytes / 1e3).toFixed(1) + " KB";
    if (bytes < 1e9) return (bytes / 1e6).toFixed(1) + " MB";
    return (bytes / 1e9).toFixed(2) + " GB";
  }

  async function openModal(f) {
    stopCurrentVideo();
    videoEl = null;
    isPlaying = false;
    currentTime = 0;
    duration = 0;
    subtitleURL = null; // ← eklendi

    const index = files.findIndex((file) => file.name === f.name);
    currentIndex = index;

    if (f.type?.startsWith("video/")) {
      selectedImage = null;
      showImageModal = false;
      selectedVideo = f;
      await tick(); // DOM güncellensin
      showModal = true; // video {#key} ile yeniden mount edilecek
    } else if (f.type?.startsWith("image/")) {
      selectedVideo = null;
      showModal = false;
      selectedImage = f;
      await tick();
      showImageModal = true;
    }
  }

  function stopCurrentVideo() {
    if (videoEl) {
      try {
        videoEl.pause();
        videoEl.src = "";
        videoEl.load();
      } catch (err) {
        console.warn("Video stop error:", err.message);
      }
    }
  }

  async function showNext() {
    if (files.length === 0) return;
    stopCurrentVideo();
    currentIndex = (currentIndex + 1) % files.length;
    await openModal(files[currentIndex]); // ← await
  }

  async function showPrev() {
    if (files.length === 0) return;
    stopCurrentVideo();
    currentIndex = (currentIndex - 1 + files.length) % files.length;
    await openModal(files[currentIndex]); // ← await
  }

  function closeModal() {
    stopCurrentVideo(); // 🔴 video tamamen durur
    showModal = false;
    selectedVideo = null;
    subtitleURL = null;
    isPlaying = false;
  }

  // 🎞️ Video kontrolleri
  async function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      try {
        await videoEl.play();
        isPlaying = true;
      } catch (err) {
        console.warn("Play rejected:", err?.message || err);
        isPlaying = false;
      }
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function updateProgress() {
    currentTime = videoEl?.currentTime || 0;
  }

  function updateDuration() {
    duration = videoEl?.duration || 0;
  }

  function seekVideo(e) {
    if (!videoEl) return;
    const newTime = parseFloat(e.target.value);
    if (Math.abs(videoEl.currentTime - newTime) > 0.2) {
      videoEl.currentTime = newTime;
    }
  }

  function changeVolume(e) {
    if (!videoEl) return;
    const val = parseFloat(e.target.value);
    videoEl.volume = val;
    e.target.style.setProperty("--fill", (val || 0) * 100);
  }

  function toggleFullscreen() {
    if (!videoEl) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoEl.requestFullscreen();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleSubtitleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const decoder = new TextDecoder("utf-8");
      const content =
        typeof ev.target.result === "string"
          ? ev.target.result
          : decoder.decode(ev.target.result);
      if (ext === "srt") {
        const vttText =
          "\uFEFFWEBVTT\n\n" + content.replace(/\r+/g, "").replace(/,/g, ".");
        const blob = new Blob([vttText], { type: "text/vtt;charset=utf-8" });
        subtitleURL = URL.createObjectURL(blob);
      } else if (ext === "vtt") {
        const blob = new Blob([content], { type: "text/vtt;charset=utf-8" });
        subtitleURL = URL.createObjectURL(blob);
      } else {
        alert("Yalnızca .srt veya .vtt dosyaları destekleniyor.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function deleteFile(file) {
    const token = localStorage.getItem("token");
    if (!confirm("Bu dosyayı silmek istediğine emin misin?")) return;

    // 1️⃣ Önce dosyayı backend'den sil
    const resp = await fetch(
      `${API}/api/file?path=${encodeURIComponent(file.name)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (resp.ok) {
      console.log("🗑️ Dosya silindi:", file.name);
      files = files.filter((f) => f.name !== file.name);

      // 2️⃣ Ek olarak Transfers listesindeki torrent'i de sil
      // hash = dosya yolundaki ilk klasör (örnek: downloads/<hash>/video.mp4)
      const hash = file.name.split("/")[0];
      console.log("🔄 Transfers listesinden de siliyorum:", hash);
      try {
        await fetch(`${API}/api/torrents/${hash}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.warn("⚠️ Transfers tarafı silinemedi:", err);
      }
    } else {
      const data = await resp.json();
      alert("Silme hatası: " + (data.error || resp.statusText));
    }
  }

  onMount(() => {
    loadFiles();

    // 🔄 WebSocket ile anlık dosya güncellemelerini dinle
    const token = localStorage.getItem("token");
    const wsUrl = `${API.replace("http", "ws")}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "fileUpdate") {
          console.log("📸 Yeni thumbnail bildirimi alındı:", msg.path);
          await loadFiles(); // 🔄 anında dosya listesini yenile
        }
      } catch (err) {
        console.warn("WebSocket mesajı çözümlenemedi:", err);
      }
    };

    // ✅ Tek event handler içinde hem Esc hem ok tuşlarını kontrol et
    function handleKey(e) {
      if (e.key === "Escape") {
        if (showModal) closeModal();
        if (showImageModal) showImageModal = false;
      } else if (showModal || showImageModal) {
        if (e.key === "ArrowRight") showNext();
        if (e.key === "ArrowLeft") showPrev();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  });
</script>

<section class="files">
  <h2>Media Library</h2>

  {#if files.length === 0}
    <div class="empty">
      <div style="font-size:42px"><i class="fa-solid fa-folder-open"></i></div>
      <div style="font-weight:700">No media found</div>
    </div>
  {:else}
    <div class="gallery">
      {#each files as f}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="media-card" on:click={() => openModal(f)}>
          {#if f.thumbnail}
            <img
              src={`${API}${f.thumbnail}?token=${localStorage.getItem("token")}`}
              alt={f.name}
              class="thumb"
              on:load={(e) => e.target.classList.add("loaded")}
            />
          {:else}
            <div class="thumb placeholder">
              <i class="fa-regular fa-image"></i>
            </div>
          {/if}
          <div class="info">
            <div class="name">{cleanFileName(f.name)}</div>
            <div class="size">{formatSize(f.size)}</div>
          </div>
          <div class="media-type-icon">
            {#if f.type?.startsWith("video/")}
              <i class="fa-solid fa-film"></i>
            {:else if f.type?.startsWith("image/")}
              <i class="fa-solid fa-image"></i>
            {/if}
          </div>
          <div
            class="delete-overlay"
            on:click|stopPropagation={() => deleteFile(f)}
          >
            <i class="fa-solid fa-trash"></i>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if showModal && selectedVideo}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="modal-overlay" on:click={closeModal}>
    <button class="global-close-btn" on:click|stopPropagation={closeModal}
      >✕</button
    >
    <button class="nav-btn left" on:click|stopPropagation={showPrev}>
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <button class="nav-btn right" on:click|stopPropagation={showNext}>
      <i class="fa-solid fa-chevron-right"></i>
    </button>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="video-title">{cleanFileName(selectedName)}</div>
      </div>

      <div class="custom-player">
        <!-- ✅ selectedVideo yokken boş src -->
        <!-- svelte-ignore a11y-media-has-caption -->
        {#key encName}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video
            bind:this={videoEl}
            src={getVideoURL()}
            class="video-element"
            playsinline
            on:timeupdate={updateProgress}
            on:loadedmetadata={async () => {
              // her yeni videoda state’i sıfırla
              isPlaying = false;
              currentTime = 0;
              updateDuration();

              const slider = document.querySelector(".volume-slider");
              if (slider) {
                slider.value = volume;
                slider.style.setProperty("--fill", slider.value * 100);
              }

              // 🎬 Otomatik oynatma (tarayıcı izin verirse)
              try {
                await videoEl.play();
                isPlaying = true;
              } catch (err) {
                console.warn("Autoplay engellendi:", err?.message || err);
                isPlaying = false;
              }
            }}
            on:ended={() => (isPlaying = false)}
          >
            {#if subtitleURL}
              <track
                kind="subtitles"
                src={subtitleURL}
                srclang={subtitleLang}
                label={subtitleLabel}
                default
              />
            {/if}
          </video>
        {/key}

        <div class="controls">
          <div class="top-controls">
            <button class="control-btn" on:click={togglePlay}>
              {#if isPlaying}
                <i class="fa-solid fa-pause"></i>
              {:else}
                <i class="fa-solid fa-play"></i>
              {/if}
            </button>

            <div class="right-controls">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                bind:value={volume}
                on:input={changeVolume}
                class="volume-slider"
              />

              <button class="control-btn" on:click={toggleFullscreen}>
                <i class="fa-solid fa-expand"></i>
              </button>

              <!-- ✅ selectedVideo yokken '#' -->
              <a
                href={selectedName ? `${API}/downloads/${selectedName}` : "#"}
                download={selectedName || undefined}
                class="control-btn"
                title="Download"
              >
                <i class="fa-solid fa-download"></i>
              </a>

              <label class="control-btn subtitle-icon" title="Add subtitles">
                <i class="fa-solid fa-closed-captioning"></i>
                <input
                  type="file"
                  accept=".srt,.vtt"
                  on:change={handleSubtitleUpload}
                  style="display: none"
                />
              </label>
            </div>
          </div>

          <div class="bottom-controls">
            <span class="time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              bind:value={currentTime}
              on:input={seekVideo}
              class="progress-slider"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
{#if showImageModal && selectedImage}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="image-modal-overlay" on:click={() => (showImageModal = false)}>
    <button
      class="image-close-btn"
      on:click|stopPropagation={() => (showImageModal = false)}>✕</button
    >
    <button class="nav-btn left" on:click|stopPropagation={showPrev}>
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <button class="nav-btn right" on:click|stopPropagation={showNext}>
      <i class="fa-solid fa-chevron-right"></i>
    </button>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="image-modal-content" on:click|stopPropagation>
      <img
        src={`${API}${selectedImage.url}?token=${localStorage.getItem("token")}`}
        alt={selectedImage.name}
        class="image-modal-img"
      />
    </div>
  </div>
{/if}

<style>
  /* === GALERİ === */
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 20px;
  }

  .media-card {
    background: #f5f5f5;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s;
    cursor: pointer;
  }

  .media-card:hover {
    transform: translateY(-4px);
  }

  .thumb {
    width: 100%;
    height: 150px;
    object-fit: cover;
  }

  .thumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 42px;
    background: #ddd;
  }

  .info {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    font-weight: 600;
    font-size: 14px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .size {
    font-size: 12px;
    color: #666;
  }

  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: white;
    font-size: 28px;
    cursor: pointer;
    z-index: 2100;
    width: 50px;
    height: 60px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.2s ease,
      transform 0.2s ease;
  }

  .nav-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-50%) scale(1.05);
  }

  .nav-btn.left {
    left: 15px;
  }

  .nav-btn.right {
    right: 15px;
  }

  .media-card {
    position: relative; /* ikonun pozisyonlanması için gerekli */
  }

  .media-type-icon {
    position: absolute;
    bottom: 6px;
    right: 8px;
    color: rgba(0, 0, 0, 0.45); /* sönük gri ton */
    font-size: 14px;
    pointer-events: none; /* tıklamayı engelle */
  }

  .media-type-icon i {
    filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.3));
  }

  /* === DELETE OVERLAY (alt kısımda) === */
  .delete-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px; /* 🔹 alt kısmın yüksekliği */
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    opacity: 0;
    transition: opacity 0.25s ease;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
  }

  /* Hover olunca görünür */
  .media-card:hover .delete-overlay {
    opacity: 1;
  }

  /* 🗑️ ikonu hover efekti */
  .delete-overlay i {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    padding: 8px 10px;
    transition:
      transform 0.15s ease,
      background 0.15s ease;
  }

  .delete-overlay i:hover {
    transform: scale(1.2);
    background: rgba(255, 255, 255, 0.35);
  }
  /* === RESPONSIVE === */
  @media (max-width: 768px) {
    .gallery {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }

  @media (max-width: 480px) {
    .gallery {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }
  }
</style>
