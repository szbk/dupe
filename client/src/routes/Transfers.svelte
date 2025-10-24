<script>
  import { onMount } from "svelte";
  import { API, apiFetch } from "../utils/api.js"; // ✅ apiFetch eklendi

  let torrents = [];
  let ws;

  // Modal / player state
  let showModal = false;
  let selectedVideo = null;
  let subtitleURL = null;
  let subtitleLang = "en";
  let subtitleLabel = "Custom Subtitles";

  // Player kontrolleri
  let videoEl;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;

  // --- WebSocket & API ---
  function wsConnect() {
    const token = localStorage.getItem("token"); // 🔒 token ekle
    const url = `${API.replace("http", "ws")}?token=${token}`;
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "progress") torrents = d.torrents || [];
    };
  }

  async function list() {
    const r = await apiFetch("/api/torrents"); // ✅ fetch yerine apiFetch
    if (!r.ok) return;
    torrents = await r.json();
  }

  async function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("torrent", f);
    await apiFetch("/api/transfer", { method: "POST", body: fd }); // ✅
    await list();
  }

  async function addMagnet() {
    const m = prompt("Magnet linki:");
    if (!m) return;
    await apiFetch("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnet: m })
    }); // ✅
    await list();
  }

  function selectFile(hash, index) {
    ws?.send(JSON.stringify({ type: "select", infoHash: hash, index }));
  }

  async function removeTorrent(hash) {
    if (!confirm("Bu transferi silmek istediğine emin misin?")) return;
    await apiFetch(`/api/torrents/${hash}`, { method: "DELETE" });
    torrents = torrents.filter((t) => t.infoHash !== hash);
    await list();
  }

  function streamURL(hash, index = 0) {
    const token = localStorage.getItem("token");
    return `${API}/stream/${hash}?index=${index}&token=${token}`;
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return "0 MB/s";
    return (bytesPerSec / 1e6).toFixed(2) + " MB/s";
  }

  function openModal(t) {
    const selectedFile =
      t.files?.find((f) => f.index === t.selectedIndex) || t.files?.[0];
    if (!selectedFile) {
      alert("Bu torrentte oynatılabilir video dosyası bulunamadı!");
      return;
    }

    selectedVideo = {
      ...t,
      fileIndex: selectedFile.index,
      fileName: selectedFile.name
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    selectedVideo = null;
    subtitleURL = null;
  }

  // --- Altyazı işlemleri (hiç değişmedi) ---
  function detectSubtitleLang(text) {
    const lower = (text || "").toLowerCase();
    if (lower.includes("ş") || lower.includes("ğ") || lower.includes("ı"))
      return { code: "tr", label: "Türkçe" };
    if (lower.includes("é") || lower.includes("è") || lower.includes("à"))
      return { code: "fr", label: "Français" };
    if (lower.includes("¿") || lower.includes("¡") || lower.includes("ñ"))
      return { code: "es", label: "Español" };
    if (lower.includes("ß") || lower.includes("ä") || lower.includes("ü"))
      return { code: "de", label: "Deutsch" };
    return { code: "en", label: "English" };
  }

  function srtToVtt(srtText) {
    const utf8BOM = "\uFEFF";
    return (
      utf8BOM +
      "WEBVTT\n\n" +
      srtText
        .replace(/\r+/g, "")
        .replace(/^\s+|\s+$/g, "")
        .split("\n\n")
        .map((block) => {
          const lines = block.split("\n");
          if (lines.length >= 2) {
            const time = lines[1]
              .replace(/,/g, ".")
              .replace(/(\d{2}):(\d{2}):(\d{2})/g, "$1:$2:$3");
            return lines.slice(1).join("\n").replace(lines[1], time);
          }
          return lines.join("\n");
        })
        .join("\n\n")
    );
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
      const detected = detectSubtitleLang(content);
      subtitleLang = detected.code;
      subtitleLabel = detected.label;

      if (ext === "srt") {
        const vttText = srtToVtt(content);
        const blob = new Blob([vttText], {
          type: "text/vtt;charset=utf-8"
        });
        subtitleURL = URL.createObjectURL(blob);
      } else if (ext === "vtt") {
        const blob = new Blob([content], {
          type: "text/vtt;charset=utf-8"
        });
        subtitleURL = URL.createObjectURL(blob);
      } else {
        alert("Yalnızca .srt veya .vtt dosyaları destekleniyor.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ESC ile kapatma
  function onEsc(e) {
    if (e.key === "Escape" && showModal) closeModal();
  }

  // Player kontrolleri
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

  let dragActive = false;
  let pageDragOverlay = false;
  let dragCounter = 0;

  // sadece drop-zone alanına gelen olayları işleme
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (torrents.length === 0) dragActive = true;
    else pageDragOverlay = true;
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (torrents.length === 0) dragActive = true;
    else pageDragOverlay = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragActive = false;
      pageDragOverlay = false;
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dragActive = false;
    pageDragOverlay = false;

    const files = Array.from(e.dataTransfer?.files || []);
    const torrentsToUpload = files.filter((f) => f.name.endsWith(".torrent"));
    if (!torrentsToUpload.length) return;

    for (const file of torrentsToUpload) {
      const fd = new FormData();
      fd.append("torrent", file);
      await apiFetch("/api/transfer", { method: "POST", body: fd });
    }

    await list();
  }

  // 🧩 Global dinleyiciler — sadece overlay için, drop'u engellemeden
  function addGlobalDragListeners() {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      dragActive = false;
      pageDragOverlay = false;
    });
  }

  onMount(() => {
    list(); // 🔒 token'lı liste çekimi
    wsConnect(); // 🔒 token'lı WebSocket
    addGlobalDragListeners();
    const slider = document.querySelector(".volume-slider");
    if (slider) {
      slider.value = volume;
      slider.style.setProperty("--fill", slider.value * 100);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  });
</script>

<!-- 💡 HTML ve stil kısmı aynı kalıyor -->

<section class="files">
  <h2>Transfers</h2>

  <div style="display:flex; gap:10px; margin-bottom:10px;">
    <label class="btn-primary" style="cursor:pointer;">
      <i class="fa-solid fa-plus btn-icon"></i> NEW TRANSFER
      <input
        type="file"
        accept=".torrent"
        on:change={upload}
        style="display:none;"
      />
    </label>
    <button class="btn-primary" on:click={addMagnet}>
      <i class="fa-solid fa-magnet btn-icon"></i> Magnet
    </button>
  </div>

  {#if torrents.length === 0}
    <div
      class="empty drop-zone {dragActive ? 'active' : ''}"
      on:dragenter={handleDragEnter}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
    >
      <div class="drop-inner">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <div class="title">Drop your .torrent file here</div>
        <div class="subtitle">or use the buttons above</div>
      </div>
    </div>
  {:else}
    <div
      class="torrent-list"
      on:dragenter={handleDragEnter}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
    >
      {#each torrents as t (t.infoHash)}
        <div class="torrent" on:click={() => openModal(t)}>
          {#if t.thumbnail}
            <img
              src={`${API}${t.thumbnail}?token=${localStorage.getItem("token")}`}
              alt="thumb"
              class="thumb"
              on:load={(e) => e.target.classList.add("loaded")}
            />
          {:else}
            <div class="thumb placeholder">
              <i class="fa-regular fa-image"></i>
            </div>
          {/if}

          <div class="torrent-info">
            <div class="torrent-header">
              <div class="torrent-name">{t.name}</div>
              <button
                class="remove-btn"
                on:click|stopPropagation={() => removeTorrent(t.infoHash)}
                title="Sil">❌</button
              >
            </div>

            <div class="torrent-hash">
              Hash: {t.infoHash} | Tracker: {t.tracker ?? "Unknown"} | Added:
              {t.added ? new Date(t.added).toLocaleString() : "Unknown"}
            </div>

            <div class="torrent-files">
              {#each t.files as f}
                <div class="file-row">
                  <button
                    on:click|stopPropagation={() =>
                      selectFile(t.infoHash, f.index)}
                  >
                    {f.index === t.selectedIndex ? "Selected" : "Select"}
                  </button>
                  <div class="filename">{f.name}</div>
                  <div class="filesize">
                    {(f.length / 1e6).toFixed(1)} MB
                  </div>
                </div>
              {/each}
            </div>

            <div class="progress-bar">
              <div
                class="progress"
                style="width:{(t.progress || 0) * 100}%"
              ></div>
            </div>

            <div class="progress-text">
              {#if (t.progress || 0) < 1}
                {(t.progress * 100).toFixed(1)}% •
                {t.downloaded ? (t.downloaded / 1e6).toFixed(1) : 0} MB •
                {formatSpeed(t.downloadSpeed)} ↓ •
                {t.numPeers ?? 0} peers
              {:else}
                100.0% • {(t.downloaded / 1e6).toFixed(1)} MB
              {/if}
            </div>
          </div>
        </div>
      {/each}
      {#if pageDragOverlay}
        <div class="page-drop-overlay">
          <div class="page-drop-text">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Drop to add torrent</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>

{#if showModal && selectedVideo}
  <div class="modal-overlay" on:click={closeModal}>
    <!-- 🟢 Global Close Button (Files.svelte ile aynı) -->
    <button class="global-close-btn" on:click|stopPropagation={closeModal}
      >✕</button
    >

    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="video-title">{selectedVideo.name}</div>
      </div>

      <div class="custom-player">
        <video
          bind:this={videoEl}
          src={streamURL(selectedVideo.infoHash, selectedVideo.fileIndex)}
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
              {#if isPlaying}<i class="fa-solid fa-pause"></i>{:else}<i
                  class="fa-solid fa-play"
                ></i>{/if}
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

              <a
                href={streamURL(
                  selectedVideo.infoHash,
                  selectedVideo.fileIndex
                )}
                download={selectedVideo.name}
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
  /* --- Torrent Listeleme --- */
  .torrent-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .torrent {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid #ccc;
    background: #f6f6f6;
    border-radius: 8px;
    padding: 10px 12px 0 12px;
    box-sizing: border-box;
    cursor: pointer;
  }

  .thumb {
    width: 100px;
    height: 60px;
    border-radius: 6px;
    object-fit: cover;
    background: #ddd;
    flex-shrink: 0;
  }

  .placeholder {
    width: 100px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ddd;
    border-radius: 6px;
    font-size: 24px;
  }

  .torrent-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .torrent-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-weight: 700;
  }

  .torrent-name {
    word-break: break-word;
  }

  .remove-btn {
    background: transparent;
    border: none;
    font-size: 18px;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .remove-btn:hover {
    transform: scale(1.2);
  }

  .torrent-hash {
    font-size: 12px;
    color: #777;
    font-family: monospace;
  }

  .torrent-files {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .file-row button {
    background: #eee;
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .file-row button:hover {
    background: #ddd;
  }

  .filename {
    flex: 1;
  }

  .filesize {
    color: #666;
    font-size: 12px;
  }

  /* --- İlerleme Çubuğu --- */
  .progress-bar {
    width: 100%;
    height: 6px;
    background: #ddd;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress {
    height: 100%;
    background: linear-gradient(90deg, #27ae60, #2ecc71);
    transition: width 0.3s;
  }

  .progress-text {
    font-size: 12px;
    color: #444;
    text-align: right;
    padding: 3px 0 8px 0;
  }

  /* 🪄 Drop Zone */
  /* === 🧊 Drop Zone (boş sayfa görünümü) === */
  .drop-zone {
    border: 2px dashed rgba(160, 160, 160, 0.4);
    border-radius: 12px;
    padding: 60px 20px;
    text-align: center;
    background: rgba(245, 245, 245, 0.5);
    transition: background 0.3s ease;
  }

  .drop-zone.active {
    backdrop-filter: blur(10px) brightness(0.9);
    background: rgba(150, 150, 150, 0.35);
    border-color: rgba(100, 100, 100, 0.6);
    transition: all 0.3s ease;
  }

  .drop-inner {
    color: #777;
  }
  .drop-inner i {
    font-size: 42px;
    color: #aaa;
  }
  .drop-inner .title {
    font-weight: 600;
    margin-top: 6px;
  }
  .drop-inner .subtitle {
    font-size: 13px;
    color: #999;
  }

  /* === Liste doluyken sayfa üstü blur === */
  .page-drop-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    backdrop-filter: blur(8px);
    background: rgba(200, 200, 200, 0.4);
    border-radius: 12px;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  .page-drop-text {
    color: #666;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-weight: 600;
    font-size: 18px;
  }

  .page-drop-text i {
    font-size: 42px;
    margin-bottom: 8px;
    color: #888;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* --- Responsive Düzenlemeler --- */
  @media (max-width: 1024px) {
    .torrent {
      grid-template-columns: 80px 1fr;
      gap: 10px;
    }

    .torrent-hash {
      font-size: 11px;
      line-height: 1.3;
    }

    .torrent-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .torrent-files .file-row {
      font-size: 12px;
    }
  }

  @media (max-width: 768px) {
    .torrent {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .thumb {
      width: 100%;
      height: 180px;
    }

    .torrent-hash {
      word-break: break-word;
      white-space: normal;
    }

    .torrent-files {
      gap: 4px;
    }

    .file-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .progress-text {
      text-align: left;
      font-size: 11px;
    }

    .torrent-list {
      gap: 10px;
    }
  }

  @media (max-width: 480px) {
    .torrent-header {
      font-size: 13px;
    }

    .torrent-hash {
      font-size: 10px;
    }
  }
</style>
