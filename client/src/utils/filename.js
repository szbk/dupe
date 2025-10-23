/**
 * Dosya adını temizler ve sadeleştirir.
 * Örnek:
 *  The.Astronaut.2025.1080p.WEBRip.x265-KONTRAST
 *   → "The Astronaut (2025)"
 *  1761244874124/Gen.V.S02E08.Cavallo.di.Troia.ITA.ENG.1080p.AMZN.WEB-DL.DDP5.1.H.264-MeM.GP.mkv
 *   → "Gen V S02E08 Cavallo Di Troia"
 */
export function cleanFileName(fullPath) {
  if (!fullPath) return "";

  // 1️⃣ Klasör yolunu kaldır
  let name = fullPath.split("/").pop();

  // 2️⃣ Uzantıyı kaldır
  name = name.replace(/\.[^.]+$/, "");

  // 3️⃣ Noktaları ve alt tireleri boşluğa çevir
  name = name.replace(/[._]+/g, " ");

  // 4️⃣ Gereksiz etiketleri kaldır
  const trashWords = [
    "1080p",
    "720p",
    "2160p",
    "4k",
    "bluray",
    "web[- ]?dl",
    "webrip",
    "hdrip",
    "x264",
    "x265",
    "hevc",
    "aac",
    "h264",
    "h265",
    "ddp5",
    "dvdrip",
    "brrip",
    "remux",
    "multi",
    "sub",
    "subs",
    "turkce",
    "ita",
    "eng",
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
    "netflix",
    "mem",
    "gp"
  ];
  const trashRegex = new RegExp(`\\b(${trashWords.join("|")})\\b`, "gi");
  name = name.replace(trashRegex, " ");

  // 5️⃣ Parantez veya köşeli parantez içindekileri kaldır
  name = name.replace(/[\[\(].*?[\]\)]/g, " ");

  // 6️⃣ Fazla tireleri ve sayıları temizle
  name = name
    .replace(/[-]+/g, " ")
    .replace(/\b\d{3,4}\b/g, " ") // tek başına 1080, 2025 gibi
    .replace(/\s{2,}/g, " ")
    .trim();

  // 7️⃣ Dizi formatını (S02E08) koru
  const episodeMatch = name.match(/(S\d{1,2}E\d{1,2})/i);
  if (episodeMatch) {
    const epTag = episodeMatch[0].toUpperCase();
    // örnek: Gen V S02E08 Cavallo di Troia
    name = name.replace(episodeMatch[0], epTag);
  }

  // 8️⃣ Baş harfleri büyüt (küçük kelimeleri koruyarak)
  name = name
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => {
      if (["di", "da", "de", "of", "and", "the"].includes(w.toLowerCase()))
        return w.toLowerCase();
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();

  return name;
}
