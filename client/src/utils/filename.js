// utils/filename.js

/**
 * Dosya adını temizler ve sadeleştirir.
 * Örnek:
 *  The.Astronaut.2025.1080p.WEBRip.x265-KONTRAST
 *   → "The Astronaut (2025)"
 */
export function cleanFileName(fullPath) {
  if (!fullPath) return "";

  // 1️⃣ Klasör yolunu kaldır
  let name = fullPath.split("/").pop();

  // 2️⃣ Uzantıyı kaldır
  name = name.replace(/\.[^.]+$/, "");

  // 3️⃣ Noktaları boşluğa çevir
  name = name.replace(/\./g, " ");

  // 4️⃣ Gereksiz etiketleri kaldır
  const trashWords = [
    "1080p",
    "720p",
    "2160p",
    "4k",
    "bluray",
    "web-dl",
    "webrip",
    "hdrip",
    "x264",
    "x265",
    "hevc",
    "aac",
    "h264",
    "h265",
    "dvdrip",
    "brrip",
    "remux",
    "multi",
    "sub",
    "subs",
    "turkce",
    "dublado",
    "dubbed",
    "extended",
    "unrated",
    "repack",
    "proper",
    "kontrast",
    "yify",
    "ettv",
    "rarbg",
    "hdtv",
    "amzn",
    "nf",
    "netflix"
  ];
  const trashRegex = new RegExp(`\\b(${trashWords.join("|")})\\b`, "gi");
  name = name.replace(trashRegex, " ");

  // 5️⃣ Köşeli parantez içindekileri kaldır
  name = name.replace(/\[[^\]]*\]/g, "");

  // 6️⃣ Parantez içindeki tarihleri kaldır
  name = name
    .replace(/\(\d{2}\.\d{2}\.\d{2,4}\)/g, "")
    .replace(/\(\d{4}(-\d{2})?(-\d{2})?\)/g, "");

  // 7️⃣ Fazla boşlukları temizle
  name = name.replace(/\s{2,}/g, " ").trim();

  // 8️⃣ Yılı tespit et (ör. 2024, 1999)
  const yearMatch = name.match(/\b(19|20)\d{2}\b/);
  let year = "";
  if (yearMatch) {
    year = yearMatch[0];
    name = name.replace(year, "").trim();
  }

  // 9️⃣ Dizi formatı (S03E01) varsa koru
  const match = name.match(/(.+?)\s*-\s*(S\d{2}E\d{2})/i);
  if (match) {
    const formatted = `${match[1].trim()} - ${match[2].toUpperCase()}`;
    return year ? `${formatted} (${year})` : formatted;
  }

  // 🔟 Fazla tireleri ve tire + parantez boşluklarını düzelt
  name = name
    .replace(/[-_]+/g, " ") // birden fazla tireyi temizle
    .replace(/\s-\s*\(/g, " (") // " - (" → " ("
    .trim();

  // 11️⃣ Baş harfleri büyüt
  name = name
    .split(" ")
    .map(
      (w) =>
        w.length > 1
          ? w[0].toUpperCase() + w.slice(1).toLowerCase()
          : w.toUpperCase()
    )
    .join(" ")
    .trim();

  // 12️⃣ Yıl varsa sonuna ekle
  if (year) name += ` (${year})`;

  return name.trim();
}
