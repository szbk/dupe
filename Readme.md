<img src="https://images2.imgbox.com/61/17/YLrfUgAj_o.jpeg" alt="du.pe logo" width="200" height="200" />


# du.pe


Simple, Fast & Lightweight Torrent Server ⚡📦

A **self-hosted torrent-based file manager and media player**, similar to Put.io — fast, minimal, and elegant.  
Add torrents, monitor downloads, and instantly stream videos through a clean web interface! 🖥️🎬

---

## ✨ Features

- 🧲 **Add Torrents**  
  - Upload `.torrent` files (via form)  
  - Add magnet links (via prompt)

- 📥 **Download Management**  
  - View active torrents  
  - See progress, speed, and remaining time  
  - Browse file trees within torrents

- 🔴 **Real-Time Updates**  
  - Live progress updates via WebSocket

- 🎞️ **Instant Playback**  
  - Stream video files directly in the browser  
  - ffmpeg-ready structure for Safari/codec compatibility

- 🗂️ **Clean & Modern Web Interface**  
  - Svelte-powered fast and lightweight UI  
  - Search bar, torrent list, detailed view  
  - Custom modal video player: title, progress bar, volume, subtitles, and download icons  
  - Mobile-friendly layout with hamburger menu support

- 🐳 **Easy Docker Setup**  
  - One-command deployment with `docker-compose.yml`

> 📝 Login and user authentication are not yet implemented — planned in the roadmap.

---

## 🏗️ Architecture

```
root
├─ client/   # Svelte-based Web UI
├─ server/   # Node.js (Express) API + WebSocket + WebTorrent
└─ docker-compose.yml
```

- **client**  
  - Developed and built using Vite  
  - Backend API configured via `VITE_API` (e.g., `http://192.168.x.x:3001`)

- **server**  
  - Express REST endpoints (list, add, stream torrents)  
  - Real-time updates via WebSocket (`progress` events)  
  - WebTorrent for downloading and seeding  
  - Optional ffmpeg integration for video transcoding

---

## 🚀 Quick Start

### 🐳 Docker Compose (Recommended)
```bash
docker compose up -d --build
```

**Default Ports:**
- Server (API): `http://localhost:3001`
- Client (UI): `http://localhost:5173`

---

## ⚙️ Environment Variables

### Client
| Variable | Description |
|-----------|--------------|
| `VITE_API` | Backend API root URL (e.g., `http://localhost:3001`) |

### Server
| Variable | Description |
|-----------|--------------|
| `PORT` | API port (default: `3001`) |

---

## 🔌 API & WebSocket Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/api/torrents` | Returns active torrents |
| `POST` | `/api/transfer` | Adds a torrent via `.torrent` file upload |
| `POST` | `/api/magnet` | Adds a torrent via magnet link |
| `GET` | `/stream/:infoHash/:fileIndex` | Streams a video or file |
| `WS` | `ws://<API_HOST>:3001/` | Torrent progress updates (`type: progress`) |

---

## 🧠 Developer Notes

- **Safari Compatibility:** Some codecs may cause issues. It’s recommended to remux files (`.mkv → .mp4`) with ffmpeg if needed.  

---

## 🛣️ Roadmap

- 🔐 Authentication (JWT or session-based)  
- 🎛️ Advanced player features (subtitle selection, quality control)  
- 🧹 File management, trash bin, and history  
- 🧪 Automated testing and CI setup

---
