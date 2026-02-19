const urlInput = document.getElementById("urlInput");
const loadVideoButton = document.getElementById("loadVideoButton");
const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const setStartFromPlayerButton = document.getElementById("setStartFromPlayerButton");
const setEndFromPlayerButton = document.getElementById("setEndFromPlayerButton");
const folderInput = document.getElementById("folderInput");
const pickFolderButton = document.getElementById("pickFolderButton");
const downloadButton = document.getElementById("downloadButton");
const refreshFilesButton = document.getElementById("refreshFilesButton");
const statusText = document.getElementById("statusText");
const logText = document.getElementById("logText");
const deviceSelect = document.getElementById("deviceSelect");
const refreshDevicesButton = document.getElementById("refreshDevicesButton");
const pickDeviceFolderButton = document.getElementById("pickDeviceFolderButton");
const filesList = document.getElementById("filesList");

let player = null;
let playerReady = false;
let currentVideoId = "";
let outputFiles = [];

function setStatus(text) {
  statusText.textContent = text;
}

function appendLog(message) {
  logText.textContent += `${message}\n`;
  logText.scrollTop = logText.scrollHeight;
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      return parsed.searchParams.get("v");
    }
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
  } catch {
    return null;
  }
  return null;
}

function isValidTime(value) {
  if (!value) return true;
  return /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(value);
}

function secondsToTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function selectedDeviceFolder() {
  return deviceSelect.value || "";
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(ms) {
  return new Date(ms).toLocaleString();
}

function renderFileList(deviceFileNames = new Set()) {
  if (!outputFiles.length) {
    filesList.innerHTML = `<div class="file-row"><span class="file-name">MP3 파일이 없습니다.</span></div>`;
    return;
  }

  filesList.innerHTML = "";
  for (const file of outputFiles) {
    const isTransferred = deviceFileNames.has(file.name);
    const row = document.createElement("div");
    row.className = "file-row";

    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.title = file.name;
    fileName.textContent = file.name;

    const size = document.createElement("span");
    size.textContent = formatSize(file.size);

    const badge = document.createElement("span");
    badge.className = `badge ${isTransferred ? "ok" : "pending"}`;
    badge.textContent = isTransferred ? "전송됨" : "미전송";

    const action = document.createElement("button");
    action.textContent = "기기로 복사";
    action.disabled = !selectedDeviceFolder();
    action.addEventListener("click", async () => {
      if (!selectedDeviceFolder()) {
        setStatus("기기 폴더를 먼저 선택하세요.");
        return;
      }
      try {
        action.disabled = true;
        setStatus(`복사 중: ${file.name}`);
        await window.shokzApi.copyFileToDevice({
          sourceFilePath: file.path,
          deviceFolder: selectedDeviceFolder()
        });
        appendLog(`기기 복사 완료: ${file.name}`);
        await refreshFiles();
        setStatus(`복사 완료: ${file.name}`);
      } catch (error) {
        action.disabled = false;
        appendLog(error.message);
        setStatus("복사 실패: 로그를 확인하세요.");
      }
    });

    row.appendChild(fileName);
    row.appendChild(size);
    row.appendChild(badge);
    row.appendChild(action);
    filesList.appendChild(row);
  }
}

async function refreshDeviceOptions() {
  const volumes = await window.shokzApi.detectShokzVolumes();
  const previous = deviceSelect.value;
  deviceSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "기기 폴더를 선택하세요";
  deviceSelect.appendChild(placeholder);

  for (const volume of volumes) {
    const option = document.createElement("option");
    option.value = volume.path;
    option.textContent = volume.isLikelyShokz
      ? `${volume.name} (Shokz 후보)`
      : volume.name;
    deviceSelect.appendChild(option);
  }

  if (previous) {
    const exists = Array.from(deviceSelect.options).some((o) => o.value === previous);
    if (exists) {
      deviceSelect.value = previous;
    }
  }
}

async function refreshFiles() {
  const outputFolder = folderInput.value.trim();
  if (!outputFolder) {
    outputFiles = [];
    renderFileList();
    return;
  }

  try {
    outputFiles = await window.shokzApi.listMp3Files({ folder: outputFolder });
    const deviceFolder = selectedDeviceFolder();
    let deviceNames = new Set();
    if (deviceFolder) {
      const deviceFiles = await window.shokzApi.listMp3Files({ folder: deviceFolder });
      deviceNames = new Set(deviceFiles.map((f) => f.name));
    }
    renderFileList(deviceNames);
  } catch (error) {
    appendLog(error.message);
    setStatus("파일 목록 새로고침 실패");
    renderFileList();
  }
}

function ensurePlayer(videoId) {
  currentVideoId = videoId;
  if (player) {
    player.loadVideoById(videoId);
    return;
  }
  player = new window.YT.Player("videoFrame", {
    videoId,
    playerVars: {
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        playerReady = true;
      }
    }
  });
}

window.onYouTubeIframeAPIReady = () => {};

loadVideoButton.addEventListener("click", () => {
  const id = extractYouTubeId(urlInput.value);
  if (!id) {
    setStatus("유효한 YouTube 링크를 입력하세요.");
    return;
  }
  if (!window.YT || !window.YT.Player) {
    setStatus("YouTube 플레이어 로드 중입니다. 잠시 후 다시 시도하세요.");
    return;
  }
  ensurePlayer(id);
  setStatus("영상 로드 완료");
});

setStartFromPlayerButton.addEventListener("click", () => {
  if (!player || !playerReady) {
    setStatus("플레이어 준비 후 다시 시도하세요.");
    return;
  }
  startInput.value = secondsToTime(player.getCurrentTime());
});

setEndFromPlayerButton.addEventListener("click", () => {
  if (!player || !playerReady) {
    setStatus("플레이어 준비 후 다시 시도하세요.");
    return;
  }
  endInput.value = secondsToTime(player.getCurrentTime());
});

pickFolderButton.addEventListener("click", async () => {
  const folder = await window.shokzApi.pickOutputFolder();
  if (!folder) return;
  folderInput.value = folder;
  await refreshFiles();
  setStatus("저장 폴더 선택 완료");
});

refreshFilesButton.addEventListener("click", refreshFiles);
refreshDevicesButton.addEventListener("click", async () => {
  await refreshDeviceOptions();
  await refreshFiles();
  setStatus("기기 목록 갱신 완료");
});

pickDeviceFolderButton.addEventListener("click", async () => {
  const folder = await window.shokzApi.pickOutputFolder();
  if (!folder) return;

  const existing = Array.from(deviceSelect.options).find((opt) => opt.value === folder);
  if (!existing) {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = `${folder} (수동 선택)`;
    deviceSelect.appendChild(option);
  }
  deviceSelect.value = folder;
  await refreshFiles();
  setStatus("기기 폴더 선택 완료");
});

deviceSelect.addEventListener("change", refreshFiles);

downloadButton.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  const startTime = startInput.value.trim();
  const endTime = endInput.value.trim();
  const outputFolder = folderInput.value.trim();

  if (!url || !outputFolder) {
    setStatus("링크와 저장 폴더는 필수입니다.");
    return;
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    setStatus("시간 형식을 확인하세요. 예: 00:01:10");
    return;
  }
  if ((startTime && !endTime) || (!startTime && endTime)) {
    setStatus("구간 추출은 시작/종료 시간을 모두 입력해야 합니다.");
    return;
  }

  setStatus("도구 확인 중...");
  const tools = await window.shokzApi.checkTools();
  if (!tools.ytDlp || !tools.ffmpeg) {
    setStatus("yt-dlp / ffmpeg 설치가 필요합니다.");
    appendLog("필수 도구 누락:");
    appendLog(`- yt-dlp: ${tools.ytDlp ? "OK" : "없음"}`);
    appendLog(`- ffmpeg: ${tools.ffmpeg ? "OK" : "없음"}`);
    appendLog("macOS 예시: brew install yt-dlp ffmpeg");
    return;
  }

  try {
    downloadButton.disabled = true;
    setStatus("MP3 생성 중...");
    appendLog(`다운로드 시작: ${url}`);
    const result = await window.shokzApi.downloadMp3({
      url,
      outputFolder,
      startTime,
      endTime
    });
    setStatus("완료: MP3 생성 성공");
    appendLog(result.logs || "완료");
    await refreshFiles();
  } catch (error) {
    setStatus("실패: 로그를 확인하세요.");
    appendLog(error.message);
  } finally {
    downloadButton.disabled = false;
  }
});

async function init() {
  await refreshDeviceOptions();
  renderFileList();
}

init();
