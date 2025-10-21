<script>
  import { onMount } from "svelte";
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

  function openModal(f) {
    selectedVideo = f;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    selectedVideo = null;
    subtitleURL = null;
  }

  // 🎞️ Video kontrolleri
  function togglePlay() {
    if (!videoEl) return;
    if (isPlaying) videoEl.pause();
    else videoEl.play();
    isPlaying = !isPlaying;
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

  function onEsc(e) {
    if (e.key === "Escape" && showModal) closeModal();
  }

  onMount(() => {
    loadFiles();
    const slider = document.querySelector(".volume-slider");
    if (slider) {
      slider.value = volume;
      slider.style.setProperty("--fill", slider.value * 100);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
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
        <div class="media-card" on:click={() => openModal(f)}>
          {#if f.thumbnail}
            <img src={`${API}${f.thumbnail}`} alt={f.name} class="thumb" />
          {:else}
            <div class="thumb placeholder">
              <i class="fa-regular fa-image"></i>
            </div>
          {/if}
          <div class="info">
            <div class="name">{cleanFileName(f.name)}</div>
            <div class="size">{formatSize(f.size)}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if showModal && selectedVideo}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="video-title">{selectedName}</div>
        <button class="close-btn" on:click={closeModal}>✕</button>
      </div>

      <div class="custom-player">
        <!-- ✅ selectedVideo yokken boş src -->
        <video
          bind:this={videoEl}
          src={getVideoURL()}
          class="video-element"
          on:timeupdate={updateProgress}
          on:loadedmetadata={() => {
            updateDuration();
            const slider = document.querySelector(".volume-slider");
            if (slider) {
              slider.value = volume;
              slider.style.setProperty("--fill", slider.value * 100);
            }
          }}
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

  /* === MODAL & PLAYER (Transfers.svelte ile birebir) === */
  .modal-overlay {
    position: fixed;
    inset: 0;
    backdrop-filter: blur(10px);
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
  }

  .modal-content {
    width: 70%;
    height: 70%;
    background: #1a1a1a;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #2a2a2a;
    padding: 10px 16px;
    color: #fff;
    font-size: 16px;
    font-weight: 500;
  }

  .video-title {
    flex: 1;
    text-align: center;
    font-weight: 600;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
  }

  .custom-player {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: #000;
  }

  .video-element {
    flex: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    border: none;
    outline: none;
  }

  .video-element:focus {
    outline: none !important;
    box-shadow: none !important;
  }

  /* === Kontroller === */
  .controls {
    background: #1c1c1c;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid #333;
  }

  .top-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .control-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .control-btn:hover {
    opacity: 0.7;
  }

  .right-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* === Ses Kaydırıcısı === */
  .volume-slider {
    -webkit-appearance: none;
    width: 100px;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      #ff3b30 calc(var(--fill, 100%) * 1%),
      rgba(255, 255, 255, 0.3) calc(var(--fill, 100%) * 1%)
    );
    outline: none;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .volume-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: transparent;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
    margin-top: -4px;
    transition: transform 0.2s ease;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    transform: scale(1.3);
  }

  .volume-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .volume-slider::-moz-range-thumb:hover {
    transform: scale(1.3);
  }

  .volume-slider::-moz-range-progress {
    height: 4px;
    background: #ff3b30;
    border-radius: 2px;
  }

  /* === Alt Kontroller === */
  .bottom-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .progress-slider {
    flex: 1;
    cursor: pointer;
    accent-color: #27ae60;
  }

  .time {
    color: #ccc;
    font-size: 13px;
    min-width: 90px;
    text-align: right;
    white-space: nowrap;
  }

  /* === Responsive === */
  @media (max-width: 1024px) {
    .modal-content {
      width: 90%;
      height: 75%;
    }
  }

  @media (max-width: 768px) {
    .gallery {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }

    .modal-content {
      width: 95%;
      height: 70%;
      border-radius: 8px;
    }

    .controls {
      padding: 6px 10px;
      gap: 6px;
    }

    .volume-slider {
      width: 70px;
    }

    .time {
      font-size: 11px;
      min-width: 70px;
    }

    .video-title {
      font-size: 14px;
    }

    .close-btn {
      font-size: 20px;
    }
  }

  @media (max-width: 480px) {
    .modal-content {
      width: 98%;
      height: 75%;
    }

    .volume-slider {
      width: 50px;
    }

    .bottom-controls {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
  }
</style>
