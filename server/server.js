import express from "express";
import cors from "cors";
import multer from "multer";
import WebTorrent from "webtorrent";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import crypto from "crypto"; // 🔒 basit token üretimi için

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, "uploads") });
const client = new WebTorrent();
const torrents = new Map();
const PORT = process.env.PORT || 3001;

// --- İndirilen dosyalar için klasör oluştur ---
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR))
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/downloads", express.static(DOWNLOAD_DIR));


// --- En uygun video dosyasını seç ---
function pickBestVideoFile(torrent) {
  const videoExts = [".mp4", ".webm", ".mkv", ".mov", ".m4v"];
  const videos = torrent.files
    .map((f, i) => ({ i, f }))
    .filter(({ f }) => videoExts.includes(path.extname(f.name).toLowerCase()));
  if (!videos.length) return 0;
  videos.sort((a, b) => b.f.length - a.f.length);
  return videos[0].i;
}

// --- Snapshot (thumbnail dahil, tracker + tarih eklendi) ---
function snapshot() {
  return Array.from(torrents.values()).map(
    ({ torrent, selectedIndex, savePath, added }) => {
      const thumbPath = path.join(savePath, "thumbnail.jpg");
      const hasThumb = fs.existsSync(thumbPath);
      return {
        infoHash: torrent.infoHash,
        name: torrent.name,
        progress: torrent.progress,
        downloaded: torrent.downloaded,
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        numPeers: torrent.numPeers,
        tracker: torrent.announce?.[0] || null, // 🆕 ilk tracker
        added, // 🆕 eklenme zamanı
        files: torrent.files.map((f, i) => ({
          index: i,
          name: f.name,
          length: f.length
        })),
        selectedIndex,
        thumbnail: hasThumb ? `/thumbnail/${torrent.infoHash}` : null
      };
    }
  );
}

// --- Basit kimlik doğrulama sistemi ---
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
let activeTokens = new Set();

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    const token = crypto.randomBytes(24).toString("hex");
    activeTokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

function requireAuth(req, res, next) {
  const token =
    req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token || !activeTokens.has(token))
    return res.status(401).json({ error: "Unauthorized" });
  next();
}


// --- Torrent veya magnet ekleme ---
app.post("/api/transfer", requireAuth, upload.single("torrent"), (req, res) => {
  try {
    let source = req.body.magnet;
    if (req.file) source = fs.readFileSync(req.file.path);
    if (!source)
      return res.status(400).json({ error: "magnet veya .torrent gerekli" });

    // Her torrent için ayrı klasör
    const savePath = path.join(DOWNLOAD_DIR, Date.now().toString());
    fs.mkdirSync(savePath, { recursive: true });

    const torrent = client.add(source, { announce: [], path: savePath });

    // 🆕 Torrent eklendiği anda tarih kaydedelim
    const added = Date.now();

    torrents.set(torrent.infoHash, {
      torrent,
      selectedIndex: 0,
      savePath,
      added
    });

    // --- Metadata geldiğinde ---
    torrent.on("ready", () => {
      const selectedIndex = pickBestVideoFile(torrent);
      torrents.set(torrent.infoHash, {
        torrent,
        selectedIndex,
        savePath,
        added
      });
      res.json({
        ok: true,
        infoHash: torrent.infoHash,
        name: torrent.name,
        selectedIndex,
        tracker: torrent.announce?.[0] || null, // 🆕
        added, // 🆕
        files: torrent.files.map((f, i) => ({
          index: i,
          name: f.name,
          length: f.length
        }))
      });
    });

    // --- İndirme tamamlandığında thumbnail oluştur ---
    torrent.on("done", () => {
      const entry = torrents.get(torrent.infoHash);
      if (!entry) return;

      const videoFile = torrent.files[entry.selectedIndex];
      const videoPath = path.join(entry.savePath, videoFile.path);
      const thumbnailPath = path.join(entry.savePath, "thumbnail.jpg");

      const cmd = `ffmpeg -ss 00:00:30 -i "${videoPath}" -frames:v 1 -q:v 2 "${thumbnailPath}"`;
      exec(cmd, (err) => {
        if (err) console.warn(`⚠️ Thumbnail oluşturulamadı: ${err.message}`);
        else console.log(`📸 Thumbnail oluşturuldu: ${thumbnailPath}`);
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Thumbnail endpoint ---
app.get("/thumbnail/:hash", (req, res) => {
  const entry = torrents.get(req.params.hash);
  if (!entry) return res.status(404).end();

  const thumbnailPath = path.join(entry.savePath, "thumbnail.jpg");
  if (!fs.existsSync(thumbnailPath))
    return res.status(404).send("Thumbnail yok");

  res.sendFile(thumbnailPath);
});

// --- Torrentleri listele ---
app.get("/api/torrents", requireAuth, (req, res) => {
  res.json(snapshot());
});

// --- Seçili dosya değiştir ---
app.post("/api/torrents/:hash/select/:index", requireAuth, (req, res) => {
  const entry = torrents.get(req.params.hash);
  if (!entry) return res.status(404).json({ error: "torrent bulunamadı" });
  entry.selectedIndex = Number(req.params.index) || 0;
  res.json({ ok: true, selectedIndex: entry.selectedIndex });
});

// --- Torrent silme (disk dahil) ---
app.delete("/api/torrents/:hash", requireAuth, (req, res) => {
  const entry = torrents.get(req.params.hash);
  if (!entry) return res.status(404).json({ error: "torrent bulunamadı" });

  const { torrent, savePath } = entry;
  torrent.destroy(() => {
    torrents.delete(req.params.hash);
    if (savePath && fs.existsSync(savePath)) {
      try {
        fs.rmSync(savePath, { recursive: true, force: true });
        console.log(`🗑️ ${savePath} klasörü silindi`);
      } catch (err) {
        console.warn(`⚠️ ${savePath} silinemedi:`, err.message);
      }
    }
    res.json({ ok: true });
  });
});

app.get("/media/:path(*)", requireAuth, (req, res) => {
  const fullPath = path.join(DOWNLOAD_DIR, req.params.path);
  if (!fs.existsSync(fullPath)) return res.status(404).send("File not found");

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(fullPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(200, head);
    fs.createReadStream(fullPath).pipe(res);
  }
});

// --- 📁 Dosya gezgini: /downloads altındaki dosyaları listele ---
app.get("/api/files", requireAuth, (req, res) => {
  const walk = (dir) => {
    let result = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of list) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(DOWNLOAD_DIR, full);

      if (entry.isDirectory()) {
        result = result.concat(walk(full));
      } else {
        // thumbnail.jpg dosyasını listeleme
        if (entry.name.toLowerCase() === "thumbnail.jpg") continue;
        const size = fs.statSync(full).size;
        const parts = rel.split(path.sep);
        const rootHash = parts[0]; // ilk klasör adı
        const thumbPath = path.join(DOWNLOAD_DIR, rootHash, "thumbnail.jpg");

        // ✅ Thumbnail dosyası gerçekten varsa ekle
        const thumb = fs.existsSync(thumbPath)
          ? `/downloads/${rootHash}/thumbnail.jpg`
          : null;

        result.push({
          name: rel,
          size,
          thumbnail: thumb
        });
      }
    }

    return result;
  };

  try {
    const files = walk(DOWNLOAD_DIR);
    res.json(files);
  } catch (err) {
    console.error("📁 Files API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Stream endpoint ---
app.get("/stream/:hash", requireAuth, (req, res) => {
  const entry = torrents.get(req.params.hash);
  if (!entry) return res.status(404).end();

  const file =
    entry.torrent.files[entry.selectedIndex] || entry.torrent.files[0];
  const total = file.length;
  const type = mime.lookup(file.name) || "video/mp4";
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Length": total,
      "Content-Type": type,
      "Accept-Ranges": "bytes"
    });
    return file.createReadStream().pipe(res);
  }

  const [s, e] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(s, 10);
  const end = e ? parseInt(e, 10) : total - 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${total}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": type
  });

  const stream = file.createReadStream({ start, end });
  stream.on("error", (err) => console.warn("Stream error:", err.message));
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});

console.log("📂 Download path:", DOWNLOAD_DIR);

// --- WebSocket: anlık durum yayını ---
const server = app.listen(PORT, () =>
  console.log(`✅ WebTorrent server ${PORT} portunda çalışıyor`)
);

// --- ✅ Client build (frontend) dosyalarını sun ---
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  // Frontend route'larını index.html'e yönlendir
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "progress", torrents: snapshot() }));
});

setInterval(() => {
  const data = JSON.stringify({ type: "progress", torrents: snapshot() });
  wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
}, 1000);

client.on("error", (err) => {
  if (!String(err).includes("uTP"))
    console.error("WebTorrent error:", err.message);
});
