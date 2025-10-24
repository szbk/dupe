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

function createImageThumbnail(filePath, outputDir) {
  const fileName = path.basename(filePath);
  const thumbDir = path.join(outputDir, "thumbnail");
  const thumbPath = path.join(thumbDir, fileName);

  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

  // 320px genişlikte orantılı thumbnail oluştur
  const cmd = `ffmpeg -y -i "${filePath}" -vf "scale=320:-1" -q:v 5 "${thumbPath}"`;

  exec(cmd, (err) => {
    if (err) {
      console.warn(`❌ Thumbnail oluşturulamadı: ${fileName}`, err.message);
    } else {
      console.log(`🖼️ Thumbnail oluşturuldu: ${thumbPath}`);
    }
  });
}

// --- Basit kimlik doğrulama sistemi ---
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
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
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
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
        tracker: torrent.announce?.[0] || null,
        added,
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

      console.log(`✅ Torrent tamamlandı: ${torrent.name}`);

      // --- 1️⃣ Video için thumbnail oluştur ---
      const videoFile = torrent.files[entry.selectedIndex];
      const videoPath = path.join(entry.savePath, videoFile.path);
      const thumbnailPath = path.join(entry.savePath, "thumbnail.jpg");

      const cmd = `ffmpeg -ss 00:00:30 -i "${videoPath}" -frames:v 1 -q:v 2 "${thumbnailPath}"`;
      exec(cmd, (err) => {
        if (err)
          console.warn(`⚠️ Video thumbnail oluşturulamadı: ${err.message}`);
        else {
          console.log(`🎞️ Video thumbnail oluşturuldu: ${thumbnailPath}`);
          const data = JSON.stringify({
            type: "fileUpdate",
            path: path.relative(DOWNLOAD_DIR, entry.savePath)
          });
          wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
        }
      });

      // --- 2️⃣ Resimler için thumbnail oluştur ---
      // Tüm resimleri tara, küçük hallerini kök klasör altındaki /thumbnail klasörüne oluştur
      const rootThumbDir = path.join(entry.savePath, "thumbnail");
      if (!fs.existsSync(rootThumbDir))
        fs.mkdirSync(rootThumbDir, { recursive: true });

      torrent.files.forEach((file) => {
        const filePath = path.join(entry.savePath, file.path);
        const mimeType = mime.lookup(filePath) || "";

        if (mimeType.startsWith("image/")) {
          const thumbPath = path.join(rootThumbDir, path.basename(filePath));

          // 320px genişlikte, orantılı küçük versiyon oluştur
          const imgCmd = `ffmpeg -y -i "${filePath}" -vf "scale=320:-1" -q:v 5 "${thumbPath}"`;
          exec(imgCmd, (err) => {
            if (err)
              console.warn(
                `⚠️ Resim thumbnail oluşturulamadı (${file.name}): ${err.message}`
              );
            else console.log(`🖼️ Resim thumbnail oluşturuldu: ${thumbPath}`);
          });
        }
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

// --- GENEL MEDYA SUNUMU (🆕 resimler + videolar) ---
app.get("/media/:path(*)", requireAuth, (req, res) => {
  const relPath = req.params.path;
  const fullPath = path.join(DOWNLOAD_DIR, relPath);
  if (!fs.existsSync(fullPath)) return res.status(404).send("File not found");

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const type = mime.lookup(fullPath) || "application/octet-stream";
  const isVideo = String(type).startsWith("video/");
  const range = req.headers.range;

  if (isVideo && range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(fullPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": type
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": type,
      "Accept-Ranges": isVideo ? "bytes" : "none"
    };
    res.writeHead(200, head);
    fs.createReadStream(fullPath).pipe(res);
  }
});

// --- 🗑️ Tekil dosya veya torrent klasörü silme ---
app.delete("/api/file", requireAuth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "path gerekli" });

  const fullPath = path.join(DOWNLOAD_DIR, filePath);
  if (!fs.existsSync(fullPath))
    return res.status(404).json({ error: "Dosya bulunamadı" });

  try {
    // 1) Dosya/klasörü sil
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`🗑️ Dosya/klasör silindi: ${fullPath}`);

    // 2) İlk segment (klasör adı) => folderId (örn: "1730048432921")
    const folderId = (filePath.split(/[\\/]/)[0] || "").trim();

    // 3) torrents Map’inde, savePath'in son klasörü folderId olan entry’yi bul
    let matchedInfoHash = null;
    for (const [infoHash, entry] of torrents.entries()) {
      const lastDir = path.basename(entry.savePath);
      if (lastDir === folderId) {
        matchedInfoHash = infoHash;
        break;
      }
    }

    // 4) Eşleşen torrent varsa destroy + Map’ten sil + snapshot yayınla
    if (matchedInfoHash) {
      const entry = torrents.get(matchedInfoHash);
      entry?.torrent?.destroy(() => {
        torrents.delete(matchedInfoHash);
        console.log(`🧹 Torrent kaydı da temizlendi: ${matchedInfoHash}`);
        // anında WebSocket güncellemesi (broadcastSnapshot global fonksiyonunu kullanıyorsan onu çağır)
        if (typeof broadcastSnapshot === "function") {
          broadcastSnapshot();
        } else if (wss) {
          const data = JSON.stringify({
            type: "progress",
            torrents: snapshot()
          });
          wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
        }
      });
    } else {
      // Torrent eşleşmediyse de listeyi tazele (ör. sade dosya silinmiştir)
      if (typeof broadcastSnapshot === "function") {
        broadcastSnapshot();
      } else if (wss) {
        const data = JSON.stringify({ type: "progress", torrents: snapshot() });
        wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Dosya silinemedi:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- 📁 Dosya gezgini (🆕 type ve url alanları eklendi; resim thumb'ı) ---
app.get("/api/files", requireAuth, (req, res) => {
  // --- 🧩 .ignoreFiles içeriğini oku ---
  let ignoreList = [];
  const ignorePath = path.join(__dirname, ".ignoreFiles");

  if (fs.existsSync(ignorePath)) {
    try {
      const raw = fs.readFileSync(ignorePath, "utf-8");
      ignoreList = raw
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l && !l.startsWith("#"));
    } catch (err) {
      console.warn("⚠️ .ignoreFiles okunamadı:", err.message);
    }
  }

  // --- 🔍 Yardımcı fonksiyon: dosya ignoreList’te mi? ---
  const isIgnored = (name) => {
    const lower = name.toLowerCase();
    const ext = path.extname(lower).replace(".", "");
    return ignoreList.some(
      (ignored) =>
        lower === ignored ||
        lower.endsWith(ignored) ||
        lower.endsWith(`.${ignored}`) ||
        ext === ignored.replace(/^\./, "")
    );
  };

  // --- 📁 Klasörleri dolaş ---
  const walk = (dir) => {
    let result = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of list) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(DOWNLOAD_DIR, full);

      if (rel.toLowerCase().includes("/thumbnail")) continue;

      // 🔥 Ignore kontrolü (hem dosya hem klasör için)
      if (isIgnored(entry.name) || isIgnored(rel)) continue;

      if (entry.isDirectory()) {
        result = result.concat(walk(full));
      } else {
        if (entry.name.toLowerCase() === "thumbnail.jpg") continue;

        const size = fs.statSync(full).size;
        const type = mime.lookup(full) || "application/octet-stream";

        const parts = rel.split(path.sep);
        const rootHash = parts[0];
        const videoThumbPath = path.join(
          DOWNLOAD_DIR,
          rootHash,
          "thumbnail.jpg"
        );
        const hasVideoThumb = fs.existsSync(videoThumbPath);

        const urlPath = encodeURIComponent(rel).replace(/%2F/g, "/");
        const url = `/media/${urlPath}`;

        const isImage = String(type).startsWith("image/");
        const isVideo = String(type).startsWith("video/");

        let thumb = null;

        // 🎬 Video thumbnail
        if (hasVideoThumb) {
          thumb = `/downloads/${rootHash}/thumbnail.jpg`;
        }

        // 🖼️ Resim thumbnail (thumbnail klasöründe varsa)
        const imageThumbPath = path.join(
          DOWNLOAD_DIR,
          rootHash,
          "thumbnail",
          path.basename(rel)
        );

        if (isImage && fs.existsSync(imageThumbPath)) {
          thumb = `/downloads/${rootHash}/thumbnail/${encodeURIComponent(
            path.basename(rel)
          )}`;
        }

        result.push({
          name: rel,
          size,
          type,
          url,
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

// --- Stream endpoint (torrent içinden) ---
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
