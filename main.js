const path = require("path");
const fs = require("fs/promises");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");

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

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

async function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
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
  const ytDlp = await commandExists("yt-dlp");
  const ffmpeg = await commandExists("ffmpeg", ["-version"]);
  return { ytDlp, ffmpeg };
});

ipcMain.handle("download-mp3", async (_, payload) => {
  const { url, outputFolder, startTime, endTime } = payload;
  const outputTemplate = path.join(outputFolder, "%(title)s.%(ext)s");

  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    outputTemplate
  ];

  if (startTime && endTime) {
    args.push("--download-sections", `*${startTime}-${endTime}`);
  }

  args.push(url);

  return new Promise((resolve, reject) => {
    const logs = [];
    const child = spawn("yt-dlp", args);

    child.stdout.on("data", (data) => logs.push(data.toString()));
    child.stderr.on("data", (data) => logs.push(data.toString()));
    child.on("error", (error) => reject(new Error(`yt-dlp 실행 실패: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, logs: logs.join("") });
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

app.whenReady().then(createWindow);

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
