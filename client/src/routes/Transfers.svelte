<script>
  import { onMount } from "svelte";
  import { API } from "../utils/api.js";

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

  // --- WebSocket & API
  function wsConnect() {
    const url = API.replace("http", "ws");
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "progress") torrents = d.torrents || [];
    };
  }

  async function list() {
    const r = await fetch(`${API}/api/torrents`);
    torrents = await r.json();
  }

  async function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("torrent", f);
    await fetch(`${API}/api/transfer`, { method: "POST", body: fd });
    await list();
  }

  async function addMagnet() {
    const m = prompt("Magnet linki:");
    if (!m) return;
    await fetch(`${API}/api/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnet: m })
    });
    await list();
  }

  function selectFile(hash, index) {
    ws?.send(JSON.stringify({ type: "select", infoHash: hash, index }));
  }

  async function removeTorrent(hash) {
    if (!confirm("Bu transferi silmek istediğine emin misin?")) return;
    await fetch(`${API}/api/torrents/${hash}`, { method: "DELETE" });
    await list();
  }

  function streamURL(hash) {
    return `${API}/stream/${hash}`;
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return "0 MB/s";
    return (bytesPerSec / 1e6).toFixed(2) + " MB/s";
  }

  function openModal(t) {
    // torrent içinde seçilmiş dosya var mı?
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

  // --- Altyazı işlemleri ---
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
    // Slider dolum rengini CSS değişkeniyle güncelle
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

  onMount(() => {
    list();
    wsConnect();

    // volume slider başlangıç dolumu
    const slider = document.querySelector(".volume-slider");
    if (slider) {
      slider.value = volume; // 1
      slider.style.setProperty("--fill", slider.value * 100);
    }

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  });
</script>

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
    <div class="empty">
      <div style="font-size:42px">➕</div>
      <div style="font-weight:700">No files whatsoever!</div>
    </div>
  {:else}
    <div class="torrent-list">
      {#each torrents as t (t.infoHash)}
        <div class="torrent" on:click={() => openModal(t)}>
          {#if t.thumbnail}
            <img src={`${API}${t.thumbnail}`} alt="thumb" class="thumb" />
          {:else}
            <div class="thumb placeholder">📷</div>
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
    </div>
  {/if}
</section>

{#if showModal && selectedVideo}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="video-title">{selectedVideo.name}</div>
        <button class="close-btn" on:click={closeModal}>✕</button>
      </div>

      <div class="custom-player">
        <video
          bind:this={videoEl}
          src={`${API}/stream/${selectedVideo.infoHash}?index=${selectedVideo.fileIndex}`}
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
                href={streamURL(selectedVideo.infoHash)}
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
  /* --- Torrent liste & satırları (eski App.svelte ile bire bir) --- */
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
  .torrent-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
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

  /* --- Modal & Player (eski ile bire bir) --- */
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

  /* Volume slider — kırmızı dolum, beyaz knob */
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
  .volume-slider::-moz-range-track {
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
  .volume-slider::-moz-range-progress {
    height: 4px;
    background: #ff3b30;
    border-radius: 2px;
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

  .subtitle-icon {
    position: relative;
  }
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

  /* NEW TRANSFER / Magnet düğmeleri */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fdce45;
    border: none;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
    border-radius: 6px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s;
    height: 36px;
    line-height: 1;
  }
  .btn-primary:hover {
    background: #fdce45;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .modal-content {
      width: 95%;
      height: 75%;
    }
  }

  /* 🔹 Responsive Düzenlemeler (hiçbir mevcut stili bozmadan eklenmiştir) */
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

    .btn-primary {
      font-size: 12px;
      padding: 6px 10px;
      height: 32px;
    }

    .modal-content {
      width: 90%;
      height: 75%;
    }
  }

  @media (max-width: 768px) {
    .files {
      margin: 0 8px 12px 8px;
      padding-top: 10px;
    }

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

    .btn-primary {
      flex: 1;
      justify-content: center;
    }

    .torrent-list {
      gap: 10px;
    }

    /* 🎬 Modal video oynatıcı mobil optimizasyonu */
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
    .btn-primary {
      font-size: 11px;
      padding: 6px 8px;
    }

    .torrent-header {
      font-size: 13px;
    }

    .torrent-hash {
      font-size: 10px;
    }

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
