const urlInput = document.getElementById("urlInput");
const loadVideoButton = document.getElementById("loadVideoButton");
const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const setStartFromPlayerButton = document.getElementById("setStartFromPlayerButton");
const setEndFromPlayerButton = document.getElementById("setEndFromPlayerButton");
const openInBrowserButton = document.getElementById("openInBrowserButton");
const fallbackPanel = document.getElementById("fallbackPanel");
const fallbackTitle = document.getElementById("fallbackTitle");
const fallbackStartRange = document.getElementById("fallbackStartRange");
const fallbackEndRange = document.getElementById("fallbackEndRange");
const fallbackStartLabel = document.getElementById("fallbackStartLabel");
const fallbackEndLabel = document.getElementById("fallbackEndLabel");
const applyFallbackRangeButton = document.getElementById("applyFallbackRangeButton");
const folderInput = document.getElementById("folderInput");
const pickFolderButton = document.getElementById("pickFolderButton");
const downloadButton = document.getElementById("downloadButton");
const addToQueueButton = document.getElementById("addToQueueButton");
const downloadQueueButton = document.getElementById("downloadQueueButton");
const installToolsButton = document.getElementById("installToolsButton");
const refreshFilesButton = document.getElementById("refreshFilesButton");
const statusText = document.getElementById("statusText");
const logText = document.getElementById("logText");
const deviceSelect = document.getElementById("deviceSelect");
const refreshDevicesButton = document.getElementById("refreshDevicesButton");
const pickDeviceFolderButton = document.getElementById("pickDeviceFolderButton");
const filesList = document.getElementById("filesList");
const queueList = document.getElementById("queueList");

const QUEUE_STORAGE_KEY = "ohMyShokzQueueV1";

let player = null;
let playerReady = false;
let currentVideoUrl = "";
let outputFiles = [];
let videoDurationSeconds = 600;
let currentVideoTitle = "";
let queueItems = [];
let queueRunning = false;

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

function parseColonTime(text) {
  if (!text) return null;
  const parts = text.split(":").map((v) => Number(v));
  if (parts.some((v) => Number.isNaN(v))) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function parseUrlTimeSpec(raw) {
  if (!raw) return null;
  const direct = Number(raw);
  if (!Number.isNaN(direct)) return direct;

  const regex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
  const match = raw.match(regex);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  const total = hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : null;
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

function normalizeFileName(name) {
  return String(name || "").normalize("NFC");
}

function sanitizeOutputName(name) {
  const normalized = String(name || "").trim().replace(/[\\/:*?"<>|]/g, "_");
  return normalized || "untitled";
}

function getCurrentFormUrl() {
  return (urlInput.value || "").trim();
}

function getCurrentFormStartTime() {
  return (startInput.value || "").trim();
}

function getCurrentFormEndTime() {
  return (endInput.value || "").trim();
}

function getCurrentFormBaseName() {
  if (currentVideoTitle) {
    return sanitizeOutputName(currentVideoTitle);
  }
  const id = extractYouTubeId(getCurrentFormUrl());
  return id ? `youtube_${id}` : `youtube_${Date.now()}`;
}

function saveQueue() {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueItems));
}

function loadQueue() {
  const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      queueItems = parsed;
    }
  } catch {
    queueItems = [];
  }
}

function updateQueueItem(itemId, updater) {
  queueItems = queueItems.map((item) => {
    if (item.id !== itemId) return item;
    return { ...item, ...updater };
  });
  saveQueue();
  renderQueue();
}

function removeQueueItem(itemId) {
  queueItems = queueItems.filter((item) => item.id !== itemId);
  saveQueue();
  renderQueue();
}

function addQueueItem(item) {
  queueItems.unshift(item);
  saveQueue();
  renderQueue();
}

function statusToClass(status) {
  if (status === "done") return "done";
  if (status === "error") return "error";
  if (status === "running") return "running";
  return "pending";
}

function statusToLabel(status) {
  if (status === "done") return "완료";
  if (status === "error") return "오류";
  if (status === "running") return "진행중";
  return "대기";
}

function renderQueue() {
  if (!queueItems.length) {
    queueList.innerHTML = `<div class="file-row"><span class="file-name">저장된 영상이 없습니다.</span></div>`;
    return;
  }

  queueList.innerHTML = "";
  for (const item of queueItems) {
    const wrapper = document.createElement("div");
    wrapper.className = "queue-item";

    const header = document.createElement("div");
    header.className = "queue-item-header";
    const title = document.createElement("div");
    title.className = "queue-item-title";
    title.textContent = item.title || "제목 없음";
    const status = document.createElement("span");
    status.className = `queue-status ${statusToClass(item.status)}`;
    status.textContent = statusToLabel(item.status);
    header.appendChild(title);
    header.appendChild(status);

    const url = document.createElement("div");
    url.className = "queue-item-url";
    url.textContent = item.url;

    const grid = document.createElement("div");
    grid.className = "queue-item-grid";
    const nameInput = document.createElement("input");
    nameInput.value = item.outputName || "";
    nameInput.placeholder = "저장 파일명";
    nameInput.addEventListener("change", () => {
      updateQueueItem(item.id, { outputName: sanitizeOutputName(nameInput.value) });
    });

    const startInputLocal = document.createElement("input");
    startInputLocal.value = item.startTime || "";
    startInputLocal.placeholder = "00:00:00";
    startInputLocal.addEventListener("change", () => {
      updateQueueItem(item.id, { startTime: startInputLocal.value.trim() });
    });

    const endInputLocal = document.createElement("input");
    endInputLocal.value = item.endTime || "";
    endInputLocal.placeholder = "00:00:00";
    endInputLocal.addEventListener("change", () => {
      updateQueueItem(item.id, { endTime: endInputLocal.value.trim() });
    });

    grid.appendChild(nameInput);
    grid.appendChild(startInputLocal);
    grid.appendChild(endInputLocal);

    const actions = document.createElement("div");
    actions.className = "queue-item-actions";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "편집 화면에 불러오기";
    loadBtn.addEventListener("click", () => {
      urlInput.value = item.url;
      startInput.value = item.startTime || "";
      endInput.value = item.endTime || "";
      currentVideoTitle = item.title || "";
      currentVideoUrl = item.url;
      setStatus("리스트 항목을 편집 화면에 불러왔습니다.");
    });

    const runBtn = document.createElement("button");
    runBtn.textContent = "MP3 변환";
    runBtn.disabled = item.status === "running" || queueRunning;
    runBtn.addEventListener("click", async () => {
      await runQueueItem(item.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => removeQueueItem(item.id));

    actions.appendChild(loadBtn);
    actions.appendChild(runBtn);
    actions.appendChild(deleteBtn);

    if (item.message) {
      const msg = document.createElement("div");
      msg.className = "queue-item-url";
      msg.textContent = item.message;
      wrapper.appendChild(msg);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(url);
    wrapper.appendChild(grid);
    wrapper.appendChild(actions);
    queueList.appendChild(wrapper);
  }
}

async function runQueueItem(itemId) {
  const item = queueItems.find((q) => q.id === itemId);
  if (!item) return;

  const outputFolder = folderInput.value.trim();
  if (!outputFolder) {
    setStatus("저장 폴더를 먼저 선택하세요.");
    return;
  }
  if ((item.startTime && !item.endTime) || (!item.startTime && item.endTime)) {
    updateQueueItem(itemId, { status: "error", message: "시작/종료 시간을 모두 입력해야 합니다." });
    return;
  }
  if (!isValidTime(item.startTime) || !isValidTime(item.endTime)) {
    updateQueueItem(itemId, { status: "error", message: "시간 형식이 올바르지 않습니다." });
    return;
  }

  updateQueueItem(itemId, { status: "running", message: "변환 중..." });
  try {
    const result = await window.shokzApi.downloadMp3({
      url: item.url,
      outputFolder,
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      outputName: sanitizeOutputName(item.outputName || item.title || `youtube_${item.id}`)
    });
    appendLog(result.logs || "완료");
    updateQueueItem(itemId, { status: "done", message: "변환 완료" });
    await refreshFiles();
  } catch (error) {
    appendLog(error.message);
    updateQueueItem(itemId, { status: "error", message: "변환 실패" });
  }
}

async function runQueueAll() {
  if (queueRunning) return;
  queueRunning = true;
  downloadQueueButton.disabled = true;
  try {
    const pending = queueItems.filter((item) => item.status !== "running");
    for (const item of pending) {
      await runQueueItem(item.id);
    }
  } finally {
    queueRunning = false;
    downloadQueueButton.disabled = false;
    renderQueue();
  }
}

function renderFileList(deviceFileNames = new Set()) {
  if (!outputFiles.length) {
    filesList.innerHTML = `<div class="file-row"><span class="file-name">MP3 파일이 없습니다.</span></div>`;
    return;
  }

  filesList.innerHTML = "";
  for (const file of outputFiles) {
    const isTransferred = deviceFileNames.has(normalizeFileName(file.name));
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

function showFallbackPanel(visible) {
  fallbackPanel.classList.toggle("hidden", !visible);
}

function syncFallbackLabels() {
  fallbackStartLabel.textContent = secondsToTime(Number(fallbackStartRange.value));
  fallbackEndLabel.textContent = secondsToTime(Number(fallbackEndRange.value));
}

function ensureFallbackRangeOrder(fromStart) {
  let start = Number(fallbackStartRange.value);
  let end = Number(fallbackEndRange.value);
  if (start > end) {
    if (fromStart) {
      end = start;
      fallbackEndRange.value = String(end);
    } else {
      start = end;
      fallbackStartRange.value = String(start);
    }
  }
}

function configureFallbackRanges() {
  const max = Math.max(1, Math.floor(videoDurationSeconds || 600));
  fallbackStartRange.min = "0";
  fallbackStartRange.max = String(max);
  fallbackEndRange.min = "0";
  fallbackEndRange.max = String(max);

  const startSec = parseColonTime(startInput.value) ?? 0;
  const endSec = parseColonTime(endInput.value) ?? max;
  fallbackStartRange.value = String(Math.min(Math.max(startSec, 0), max));
  fallbackEndRange.value = String(Math.min(Math.max(endSec, 0), max));
  ensureFallbackRangeOrder(true);
  syncFallbackLabels();
}

function applyUrlTimes(url) {
  try {
    const parsed = new URL(url);
    const t = parseUrlTimeSpec(
      parsed.searchParams.get("t") ||
      parsed.searchParams.get("start") ||
      parsed.searchParams.get("time_continue")
    );
    const end = parseUrlTimeSpec(parsed.searchParams.get("end"));
    let hashT = null;
    if (parsed.hash && parsed.hash.startsWith("#t=")) {
      hashT = parseUrlTimeSpec(parsed.hash.replace("#t=", ""));
    }

    const startValue = t ?? hashT;
    if (startValue !== null) {
      startInput.value = secondsToTime(startValue);
    }
    if (end !== null) {
      endInput.value = secondsToTime(end);
    }
  } catch {
    return;
  }
}

async function loadVideoMetadata(url) {
  const metadata = await window.shokzApi.getVideoMetadata({ url });
  if (!metadata) {
    videoDurationSeconds = 600;
    currentVideoTitle = "";
    fallbackTitle.textContent = "임베드 불가 영상";
    configureFallbackRanges();
    return;
  }
  videoDurationSeconds = Math.max(1, Number(metadata.duration || 600));
  currentVideoTitle = metadata.title || "";
  fallbackTitle.textContent = currentVideoTitle || "임베드 불가 영상";
  configureFallbackRanges();
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
      deviceNames = new Set(deviceFiles.map((f) => normalizeFileName(f.name)));
    }
    renderFileList(deviceNames);
  } catch (error) {
    appendLog(error.message);
    setStatus("파일 목록 새로고침 실패");
    renderFileList();
  }
}

function ensurePlayer(videoId) {
  if (player && typeof player.destroy === "function") {
    player.destroy();
    player = null;
    playerReady = false;
  }

  player = new window.YT.Player("videoFrame", {
    videoId,
    playerVars: {
      modestbranding: 1,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: () => {
        playerReady = true;
        showFallbackPanel(false);
      },
      onError: (event) => {
        const code = Number(event.data);
        if (code === 101 || code === 150) {
          setStatus("임베드 제한 영상입니다. 아래 바에서 구간을 선택하세요.");
          showFallbackPanel(true);
          configureFallbackRanges();
          return;
        }
        if (code === 2) {
          setStatus("영상 URL/ID가 올바르지 않습니다.");
          return;
        }
        if (code === 100) {
          setStatus("삭제되었거나 비공개 영상입니다.");
          return;
        }
        setStatus(`플레이어 오류 (${code})`);
      }
    }
  });
}

async function ensureToolsReady() {
  setStatus("도구 확인 중...");
  const tools = await window.shokzApi.checkTools();
  if (!tools.ytDlp || !tools.ffmpeg) {
    setStatus("도구가 필요합니다. '도구 자동 설치'를 먼저 실행하세요.");
    appendLog("필수 도구 누락:");
    appendLog(`- yt-dlp: ${tools.ytDlp ? "OK" : "없음"}`);
    appendLog(`- ffmpeg: ${tools.ffmpeg ? "OK" : "없음"}`);
    appendLog("앱 내 '도구 자동 설치' 버튼을 눌러 설치할 수 있습니다.");
    return false;
  }
  return true;
}

window.onYouTubeIframeAPIReady = () => {};

loadVideoButton.addEventListener("click", async () => {
  currentVideoUrl = getCurrentFormUrl();
  const id = extractYouTubeId(currentVideoUrl);
  if (!id) {
    setStatus("유효한 YouTube 링크를 입력하세요.");
    return;
  }

  applyUrlTimes(currentVideoUrl);
  await loadVideoMetadata(currentVideoUrl);

  if (!window.YT || !window.YT.Player) {
    setStatus("YouTube 플레이어 로드 중입니다. 잠시 후 다시 시도하세요.");
    showFallbackPanel(true);
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
  configureFallbackRanges();
});

setEndFromPlayerButton.addEventListener("click", () => {
  if (!player || !playerReady) {
    setStatus("플레이어 준비 후 다시 시도하세요.");
    return;
  }
  endInput.value = secondsToTime(player.getCurrentTime());
  configureFallbackRanges();
});

openInBrowserButton.addEventListener("click", async () => {
  const url = currentVideoUrl || getCurrentFormUrl();
  if (!url) {
    setStatus("브라우저로 열 링크가 없습니다.");
    return;
  }
  await window.shokzApi.openExternalUrl({ url });
});

fallbackStartRange.addEventListener("input", () => {
  ensureFallbackRangeOrder(true);
  syncFallbackLabels();
});

fallbackEndRange.addEventListener("input", () => {
  ensureFallbackRangeOrder(false);
  syncFallbackLabels();
});

applyFallbackRangeButton.addEventListener("click", () => {
  startInput.value = secondsToTime(Number(fallbackStartRange.value));
  endInput.value = secondsToTime(Number(fallbackEndRange.value));
  setStatus("바 구간을 시작/종료 시간에 반영했습니다.");
});

installToolsButton.addEventListener("click", async () => {
  try {
    installToolsButton.disabled = true;
    setStatus("도구 설치 중...");
    appendLog("yt-dlp 자동 설치 시작");
    await window.shokzApi.installTools();
    const tools = await window.shokzApi.checkTools();
    appendLog(`- yt-dlp: ${tools.ytDlp ? "OK" : "없음"}`);
    appendLog(`- ffmpeg: ${tools.ffmpeg ? "OK" : "없음"}`);
    if (tools.ytDlp && tools.ffmpeg) {
      setStatus("도구 설치 완료");
    } else {
      setStatus("일부 도구 설치 실패");
    }
  } catch (error) {
    appendLog(error.message);
    setStatus("도구 설치 실패");
  } finally {
    installToolsButton.disabled = false;
  }
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
  const url = getCurrentFormUrl();
  const startTime = getCurrentFormStartTime();
  const endTime = getCurrentFormEndTime();
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

  const toolsReady = await ensureToolsReady();
  if (!toolsReady) return;

  try {
    downloadButton.disabled = true;
    setStatus("MP3 생성 중...");
    appendLog(`다운로드 시작: ${url}`);
    const result = await window.shokzApi.downloadMp3({
      url,
      outputFolder,
      startTime,
      endTime,
      outputName: getCurrentFormBaseName()
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

addToQueueButton.addEventListener("click", async () => {
  const url = getCurrentFormUrl();
  const startTime = getCurrentFormStartTime();
  const endTime = getCurrentFormEndTime();
  if (!url) {
    setStatus("링크를 먼저 입력하세요.");
    return;
  }
  if ((startTime && !endTime) || (!startTime && endTime)) {
    setStatus("구간 추출은 시작/종료 시간을 모두 입력해야 합니다.");
    return;
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    setStatus("시간 형식을 확인하세요. 예: 00:01:10");
    return;
  }

  if (!currentVideoTitle) {
    await loadVideoMetadata(url);
  }

  addQueueItem({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    url,
    title: currentVideoTitle || url,
    outputName: getCurrentFormBaseName(),
    startTime,
    endTime,
    status: "pending",
    message: "",
    createdAt: Date.now()
  });
  setStatus("리스트에 저장했습니다.");
});

downloadQueueButton.addEventListener("click", async () => {
  const outputFolder = folderInput.value.trim();
  if (!outputFolder) {
    setStatus("저장 폴더를 먼저 선택하세요.");
    return;
  }
  const toolsReady = await ensureToolsReady();
  if (!toolsReady) return;
  await runQueueAll();
});

async function init() {
  loadQueue();
  renderQueue();
  await refreshDeviceOptions();
  showFallbackPanel(false);
  configureFallbackRanges();
  renderFileList();
}

init();
