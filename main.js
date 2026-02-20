const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const http = require("http");
const https = require("https");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const ffmpegStatic = require("ffmpeg-static");

let rendererServer = null;
let rendererServerUrl = null;

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain; charset=utf-8";
}

function startRendererServer() {
  return new Promise((resolve, reject) => {
    const rendererRoot = path.join(__dirname, "renderer");
    rendererServer = http.createServer((req, res) => {
      const rawUrl = req.url || "/";
      const normalizedPath = rawUrl.split("?")[0] === "/" ? "index.html" : rawUrl.split("?")[0];
      const safePath = path
        .normalize(normalizedPath)
        .replace(/^(\.\.[/\\])+/, "")
        .replace(/^[/\\]+/, "");
      const filePath = path.join(rendererRoot, safePath);

      if (!filePath.startsWith(rendererRoot)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fsSync.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": getContentType(filePath) });
        res.end(data);
      });
    });

    rendererServer.on("error", reject);
    rendererServer.listen(0, "127.0.0.1", () => {
      const address = rendererServer.address();
      rendererServerUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadURL(rendererServerUrl);
}

async function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function getBundledFfmpegPath() {
  if (!ffmpegStatic) return null;
  return ffmpegStatic;
}

function getUserToolsDir() {
  return path.join(app.getPath("userData"), "tools");
}

function getUserYtDlpPath() {
  return path.join(getUserToolsDir(), "yt-dlp");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveYtDlpPath() {
  const localPath = getUserYtDlpPath();
  if (await fileExists(localPath)) {
    return localPath;
  }
  return "yt-dlp";
}

async function resolveFfmpegPath() {
  const bundled = getBundledFfmpegPath();
  if (bundled && (await fileExists(bundled))) {
    return bundled;
  }
  return "ffmpeg";
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        downloadFile(response.headers.location, targetPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`다운로드 실패: HTTP ${response.statusCode}`));
        return;
      }

      const stream = fsSync.createWriteStream(targetPath, { mode: 0o755 });
      response.pipe(stream);
      stream.on("finish", () => {
        stream.close(() => resolve());
      });
      stream.on("error", (error) => reject(error));
    });
    request.on("error", reject);
  });
}

ipcMain.handle("pick-output-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("check-tools", async () => {
  const ytDlpPath = await resolveYtDlpPath();
  const ffmpegPath = await resolveFfmpegPath();
  const ytDlp =
    ytDlpPath !== "yt-dlp" ||
    (await commandExists("yt-dlp"));
  const ffmpeg =
    ffmpegPath !== "ffmpeg" ||
    (await commandExists("ffmpeg", ["-version"]));
  return {
    ytDlp,
    ffmpeg,
    autoInstallableYtDlp: true,
    ytDlpPath,
    ffmpegPath
  };
});

ipcMain.handle("install-tools", async () => {
  const toolsDir = getUserToolsDir();
  await fs.mkdir(toolsDir, { recursive: true });

  const ytDlpPath = getUserYtDlpPath();
  await downloadFile(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
    ytDlpPath
  );
  await fs.chmod(ytDlpPath, 0o755);

  return { ok: true, ytDlpPath };
});

ipcMain.handle("get-video-metadata", async (_, payload) => {
  const { url } = payload;
  const ytDlpBin = await resolveYtDlpPath();
  if (ytDlpBin === "yt-dlp" && !(await commandExists("yt-dlp"))) {
    return null;
  }

  const args = ["--dump-single-json", "--no-playlist", "--skip-download", url];
  return new Promise((resolve) => {
    const logs = [];
    let stdout = "";
    const child = spawn(ytDlpBin, args);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => logs.push(data.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const json = JSON.parse(stdout);
        resolve({
          title: json.title || "",
          duration: Number(json.duration || 0)
        });
      } catch {
        resolve(null);
      }
    });
  });
});

ipcMain.handle("download-mp3", async (_, payload) => {
  const { url, outputFolder, startTime, endTime, outputName } = payload;
  const ytDlpBin = await resolveYtDlpPath();
  const ffmpegBin = await resolveFfmpegPath();
  const outputTemplate = outputName
    ? path.join(outputFolder, `${outputName}.%(ext)s`)
    : path.join(outputFolder, "%(title)s.%(ext)s");

  let normalizedUrl = url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
      normalizedUrl = `https://www.youtube.com/watch?v=${parsed.searchParams.get("v")}`;
    }
  } catch {
    normalizedUrl = url;
  }

  const args = [
    "--no-playlist",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--ffmpeg-location",
    ffmpegBin,
    "-o",
    outputTemplate
  ];

  if (startTime && endTime) {
    args.push("--download-sections", `*${startTime}-${endTime}`);
  }

  args.push(normalizedUrl);

  return new Promise((resolve, reject) => {
    const logs = [];
    const child = spawn(ytDlpBin, args);

    child.stdout.on("data", (data) => logs.push(data.toString()));
    child.stderr.on("data", (data) => logs.push(data.toString()));
    child.on("error", (error) => reject(new Error(`yt-dlp 실행 실패: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          logs: logs.join(""),
          outputPath: outputName ? path.join(outputFolder, `${outputName}.mp3`) : null
        });
        return;
      }
      reject(new Error(`다운로드 실패 (exit code ${code})\n${logs.join("")}`));
    });
  });
});

async function listMp3Files(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".mp3")) {
      continue;
    }
    const fullPath = path.join(folder, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      path: fullPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

ipcMain.handle("list-mp3-files", async (_, payload) => {
  const { folder } = payload;
  return listMp3Files(folder);
});

ipcMain.handle("detect-shokz-volumes", async () => {
  const volumesRoot = "/Volumes";
  const entries = await fs.readdir(volumesRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const mountPath = path.join(volumesRoot, entry.name);
    const lower = entry.name.toLowerCase();
    const isLikelyShokz =
      lower.includes("shokz") ||
      lower.includes("swim") ||
      lower.includes("openswim");
    candidates.push({
      name: entry.name,
      path: mountPath,
      isLikelyShokz
    });
  }

  candidates.sort((a, b) => {
    if (a.isLikelyShokz && !b.isLikelyShokz) return -1;
    if (!a.isLikelyShokz && b.isLikelyShokz) return 1;
    return a.name.localeCompare(b.name);
  });
  return candidates;
});

ipcMain.handle("copy-file-to-device", async (_, payload) => {
  const { sourceFilePath, deviceFolder } = payload;
  const destinationPath = path.join(deviceFolder, path.basename(sourceFilePath));
  await fs.copyFile(sourceFilePath, destinationPath);
  return { ok: true, destinationPath };
});

ipcMain.handle("open-external-url", async (_, payload) => {
  const { url } = payload;
  await shell.openExternal(url);
  return { ok: true };
});

app.whenReady().then(async () => {
  await startRendererServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (rendererServer) {
    rendererServer.close();
  }
});
