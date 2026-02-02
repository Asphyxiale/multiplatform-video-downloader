const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

//download directory
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

//find yt-dlp
let YT_DLP_PATH = "yt-dlp";

//common locations
const possiblePaths = [
  "yt-dlp",
  "yt-dlp.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages", "yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe", "yt-dlp.exe"),
  path.join(process.env.USERPROFILE || "", "yt-dlp.exe"),
  path.join(process.env.USERPROFILE || "", "Downloads", "yt-dlp.exe"),
  "C:\\yt-dlp\\yt-dlp.exe",
];

function findYtDlp() {
  return new Promise((resolve) => {
    exec("where yt-dlp", (error, stdout) => {
      if (!error && stdout.trim()) {
        YT_DLP_PATH = stdout.trim().split("\n")[0].trim();
        console.log("Found yt-dlp at:", YT_DLP_PATH);
        resolve(true);
      } else {
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            YT_DLP_PATH = p;
            console.log("Found yt-dlp at:", YT_DLP_PATH);
            resolve(true);
            return;
          }
        }
        console.log("yt-dlp not found, using default command");
        resolve(false);
      }
    });
  });
}

//detect platform
function detectPlatform(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return "unknown";
}

//clean names
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

//get info
app.post("/api/info", (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return res.status(400).json({
      error: "Unsupported platform. Use YouTube, TikTok, or Instagram.",
    });
  }

  const command = `"${YT_DLP_PATH}" --dump-json --no-warnings "${url}"`;
  console.log("Getting info:", command);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error:", stderr || error.message);
      return res.status(500).json({
        error: `Failed to fetch video info. ${stderr || error.message}`,
      });
    }

    //mp4
    try {
      const info = JSON.parse(stdout);
      const formats = [];
      formats.push({
        format_id: "bv*+ba/b",
        quality: "Best Quality (MP4)",
        ext: "mp4",
        type: "video",
      });
      if (info.formats) {
        const heights = new Set();
        info.formats
          .filter((f) => f.height && f.vcodec !== "none")
          .forEach((f) => heights.add(f.height));
        Array.from(heights)
          .sort((a, b) => b - a)
          .slice(0, 5)
          .forEach((height) => {
            formats.push({
              format_id: `bv*[height<=${height}]+ba/b[height<=${height}]`,
              quality: `${height}p (MP4)`,
              ext: "mp4",
              type: "video",
            });
          });
      }

      //mp3
      formats.push({
        format_id: "ba",
        quality: "Audio Only (MP3)",
        ext: "mp3",
        type: "audio",
      });

      res.json({
        title: info.title || "Unknown Title",
        thumbnail: info.thumbnail || "",
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || "Unknown",
        platform: platform,
        formats: formats,
        original_url: url,
      });
    } catch (parseError) {
      console.error("Parse error:", parseError);
      res.status(500).json({ error: "Failed to parse video info" });
    }
  });
});

app.post("/api/download", (req, res) => {
  const { url, format_id, type } = req.body;
  if (!url || !format_id) {
    return res.status(400).json({ error: "URL and format are required" });
  }
  const timestamp = Date.now();
  const ext = type === "audio" ? "mp3" : "mp4";
  const outputTemplate = path.join(DOWNLOADS_DIR, `%(title).100s_${timestamp}.${ext}`);

  let command;
  if (type === "audio") {
    command = `"${YT_DLP_PATH}" -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 --no-check-certificates --prefer-ffmpeg -o "${outputTemplate}" "${url}"`;
  } else {
    command = `"${YT_DLP_PATH}" -f "${format_id}" --remux-video mp4 --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;
  }

  console.log("Executing:", command);

  exec(command, { maxBuffer: 1024 * 1024 * 100, timeout: 600000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Download error:", stderr || error.message);
      console.error("Full error:", error);
      return res.status(500).json({
        error: `Download failed: ${stderr || error.message}`,
      });
    }
    console.log("Download output:", stdout);
    const files = fs
      .readdirSync(DOWNLOADS_DIR)
      .filter((f) => f.includes(`_${timestamp}`))
      .map((f) => path.join(DOWNLOADS_DIR, f));

    if (files.length === 0) {
      return res.status(500).json({ error: "Download completed but file not found" });
    }

    const downloadedFile = files[0];
    const filename = path.basename(downloadedFile);

    console.log("Downloaded file:", filename);

    res.json({
      success: true,
      filename: filename,
      downloadUrl: `/downloads/${encodeURIComponent(filename)}`,
    });
  });
});


app.use("/downloads", express.static(DOWNLOADS_DIR));
app.get("/api/file/:filename", (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error("Download error:", err);
    }
  });
});

app.get("/api/health", async (req, res) => {
  exec(`"${YT_DLP_PATH}" --version`, (error, stdout) => {
    if (error) {
      res.json({ status: "error", message: "yt-dlp not found", ytdlp: null });
    } else {
      res.json({ status: "ok", ytdlp: stdout.trim(), path: YT_DLP_PATH });
    }
  });
});

findYtDlp().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎬 Video Downloader Server Running!                     ║
║                                                           ║
║   Open: http://localhost:${PORT}                          ║
║                                                           ║
║   Supports: YouTube, TikTok, Instagram                    ║
║                                                           ║
║   yt-dlp: ${YT_DLP_PATH.substring(0, 43).padEnd(43)}      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
});
