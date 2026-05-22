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
const refreshFilesButton = document.getElementById("refreshFilesButton");
const addChaptersToQueueButton = document.getElementById("addChaptersToQueueButton");
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
let currentVideoChapters = [];

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

function isYouTubePlaylistUrl(url) {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.includes("youtube.com") && parsed.searchParams.has("list");
  } catch {
    return false;
  }
}

function setPlaylistMode(enabled) {
  addToQueueButton.classList.toggle("pulse", enabled);
  addToQueueButton.innerHTML = enabled
    ? `<span class="icon">📋</span> 재생목록 일괄 저장`
    : `<span class="icon">➕</span> 대기 목록에 추가`;
  downloadButton.innerHTML = enabled
    ? `<span class="icon">⚡</span> 재생목록 바로 변환`
    : `<span class="icon">⬇️</span> MP3로 변환하기`;
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

function addQueueItems(items) {
  queueItems = [...items, ...queueItems];
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
    queueList.innerHTML = `<div class="status-message">Queue is empty</div>`;
    return;
  }

  queueList.innerHTML = "";
  for (const item of queueItems) {
    const wrapper = document.createElement("div");
    wrapper.className = "queue-item";

    // Header: Title + Status
    const header = document.createElement("div");
    header.className = "queue-item-header";
    const title = document.createElement("span");
    title.textContent = item.title || "No Title";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";

    const status = document.createElement("span");
    status.className = `queue-status ${statusToClass(item.status)}`;
    status.textContent = statusToLabel(item.status);

    header.appendChild(title);
    header.appendChild(status);

    // Controls
    const controls = document.createElement("div");
    controls.style.display = "grid";
    controls.style.gap = "8px";
    controls.style.marginTop = "8px";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.outputName || "";
    nameInput.placeholder = "Filename";
    nameInput.addEventListener("change", () => {
      updateQueueItem(item.id, { outputName: sanitizeOutputName(nameInput.value) });
    });

    const timeRow = document.createElement("div");
    timeRow.style.display = "flex";
    timeRow.style.gap = "8px";

    const startInputLocal = document.createElement("input");
    startInputLocal.type = "text";
    startInputLocal.value = item.startTime || "";
    startInputLocal.placeholder = "Start";
    startInputLocal.style.flex = "1";
    startInputLocal.addEventListener("change", () => {
      updateQueueItem(item.id, { startTime: startInputLocal.value.trim() });
    });

    const endInputLocal = document.createElement("input");
    endInputLocal.type = "text";
    endInputLocal.value = item.endTime || "";
    endInputLocal.placeholder = "End";
    endInputLocal.style.flex = "1";
    endInputLocal.addEventListener("change", () => {
      updateQueueItem(item.id, { endTime: endInputLocal.value.trim() });
    });

    timeRow.appendChild(startInputLocal);
    timeRow.appendChild(endInputLocal);

    // Actions
    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.justifyContent = "flex-end";
    actionRow.style.gap = "8px";
    actionRow.style.marginTop = "4px";

    const loadBtn = document.createElement("button");
    loadBtn.className = "btn-small";
    loadBtn.textContent = "Edit";
    loadBtn.addEventListener("click", () => {
      urlInput.value = item.url;
      startInput.value = item.startTime || "";
      endInput.value = item.endTime || "";
      currentVideoTitle = item.title || "";
      currentVideoUrl = item.url;
      setStatus("Loaded into editor");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-small";
    deleteBtn.style.color = "var(--danger)";
    deleteBtn.textContent = "Remove";
    deleteBtn.addEventListener("click", () => removeQueueItem(item.id));

    actionRow.appendChild(loadBtn);
    actionRow.appendChild(deleteBtn);

    controls.appendChild(nameInput);
    controls.appendChild(timeRow);
    controls.appendChild(actionRow);

    wrapper.appendChild(header);
    wrapper.appendChild(controls);

    if (item.message) {
      const msg = document.createElement("div");
      msg.className = "status-message";
      msg.style.textAlign = "left";
      msg.style.marginTop = "4px";
      msg.textContent = item.message;
      wrapper.appendChild(msg);
    }

    queueList.appendChild(wrapper);
  }
}

async function runQueueItem(itemId) {
  const item = queueItems.find((q) => q.id === itemId);
  if (!item) return;

  const outputFolder = folderInput.value.trim();
  if (!outputFolder) {
    setStatus("Select output folder first");
    return;
  }
  if ((item.startTime && !item.endTime) || (!item.startTime && item.endTime)) {
    updateQueueItem(itemId, { status: "error", message: "Start/End time mismatch" });
    return;
  }

  updateQueueItem(itemId, { status: "running", message: "Processing..." });
  try {
    let result;
    if (item.type === "chapter_batch") {
      result = await window.shokzApi.downloadChaptersBatch({
        url: item.url,
        outputFolder,
        chapters: item.chapters,
        baseName: item.outputName
      });
    } else {
      result = await window.shokzApi.downloadMp3({
        url: item.url,
        outputFolder,
        startTime: item.startTime || "",
        endTime: item.endTime || "",
        outputName: sanitizeOutputName(item.outputName || item.title || `youtube_${item.id}`)
      });
    }
    appendLog(result.logs || "Done");
    updateQueueItem(itemId, { status: "done", message: "Done" });
    await refreshFiles();
  } catch (error) {
    appendLog(error.message);
    updateQueueItem(itemId, { status: "error", message: "Failed" });
  }
}

async function runQueueAll() {
  if (queueRunning) return;
  queueRunning = true;
  downloadQueueButton.disabled = true;
  downloadQueueButton.textContent = "처리 중...";

  try {
    const pending = queueItems.filter((item) => item.status !== "done");
    const concurrency = 3;

    // Process items in batches of 'concurrency'
    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      await Promise.all(batch.map(item => runQueueItem(item.id)));
    }
  } finally {
    queueRunning = false;
    downloadQueueButton.disabled = false;
    downloadQueueButton.textContent = "전체 변환";
    renderQueue();
  }
}

function renderFileList(deviceFileNames = new Set()) {
  if (!outputFiles.length) {
    filesList.innerHTML = `<div class="status-message">No MP3 files found</div>`;
    return;
  }

  filesList.innerHTML = "";
  for (const file of outputFiles) {
    const isTransferred = deviceFileNames.has(normalizeFileName(file.name));
    const row = document.createElement("div");
    row.className = "file-row";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "center";

    const fileName = document.createElement("span");
    fileName.style.fontWeight = "600";
    fileName.style.overflow = "hidden";
    fileName.style.textOverflow = "ellipsis";
    fileName.style.whiteSpace = "nowrap";
    fileName.title = file.name;
    fileName.textContent = file.name;

    topRow.appendChild(fileName);

    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.alignItems = "center";
    bottomRow.style.fontSize = "12px";
    bottomRow.style.color = "var(--text-secondary)";

    const size = document.createElement("span");
    size.textContent = formatSize(file.size);

    const action = document.createElement("button");
    action.className = "btn-small";
    action.textContent = isTransferred ? "Transferred" : "Copy to Device";
    action.disabled = !selectedDeviceFolder() || isTransferred;
    if (isTransferred) {
      action.style.color = "var(--success)";
      action.style.background = "transparent";
    }

    action.addEventListener("click", async () => {
      if (!selectedDeviceFolder()) {
        setStatus("Select device folder first");
        return;
      }
      try {
        action.disabled = true;
        setStatus(`Copying: ${file.name}`);
        await window.shokzApi.copyFileToDevice({
          sourceFilePath: file.path,
          deviceFolder: selectedDeviceFolder()
        });
        appendLog(`Copied: ${file.name}`);
        await refreshFiles();
        setStatus(`Copied: ${file.name}`);
      } catch (error) {
        action.disabled = false;
        appendLog(error.message);
        setStatus("Copy failed");
      }
    });

    bottomRow.appendChild(size);
    bottomRow.appendChild(action);

    row.appendChild(topRow);
    row.appendChild(bottomRow);
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
  setStatus("영상 및 챕터 정보를 분석하는 중입니다... 🔍");
  const metadata = await window.shokzApi.getVideoMetadata({ url });
  if (!metadata) {
    videoDurationSeconds = 600;
    currentVideoTitle = "";
    currentVideoChapters = [];
    fallbackTitle.textContent = "Embedding Restricted";
    addChaptersToQueueButton.classList.add("hidden");
    configureFallbackRanges();
    setStatus("영상 정보를 가져오지 못했습니다.");
    return;
  }
  videoDurationSeconds = Math.max(1, Number(metadata.duration || 600));
  currentVideoTitle = metadata.title || "";
  currentVideoChapters = metadata.chapters || [];
  fallbackTitle.textContent = currentVideoTitle || "Embedding Restricted";

  if (currentVideoChapters.length > 0) {
    setStatus(`💡 ${currentVideoChapters.length}개의 챕터를 찾았습니다! '챕터별 대기 목록에 추가' 버튼을 눌러보세요.`);
    addChaptersToQueueButton.classList.remove("hidden");
  } else {
    addChaptersToQueueButton.classList.add("hidden");
    setStatus("영상 정보를 불러왔습니다. (챕터 없음)");
  }

  // Auto-set start/end times
  startInput.value = "00:00:00";
  endInput.value = secondsToTime(videoDurationSeconds);

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

// Fallback function using yt-dlp
async function fetchMetadataFallback(reason) {
  setStatus(`${reason} yt-dlp로 메타데이터 조회 중...`);
  await loadVideoMetadata(currentVideoUrl);
}

function updateUiWithMetadata(title, duration) {
  currentVideoTitle = title;
  videoDurationSeconds = Math.max(1, duration);

  fallbackTitle.textContent = currentVideoTitle || "Embedding Restricted";

  // Auto-set start/end times if not already set or if it's a new load
  startInput.value = "00:00:00";
  endInput.value = secondsToTime(videoDurationSeconds);

  configureFallbackRanges();
  setStatus("Video loaded (Player)");
}

function ensurePlayer(videoId) {
  if (player && typeof player.destroy === "function") {
    player.destroy();
    player = null;
    playerReady = false;
  }

  showFallbackPanel(false); // Hide fallback initially
  setStatus("Loading Player...");

  player = new window.YT.Player("videoFrame", {
    videoId,
    playerVars: {
      modestbranding: 1,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: (event) => {
        playerReady = true;
        const data = event.target.getVideoData();
        const duration = event.target.getDuration();

        if (data && data.title) {
          updateUiWithMetadata(data.title, duration);
        }
      },
      onStateChange: (event) => {
        // Sometimes duration is not available immediately onReady
        if (event.data === window.YT.PlayerState.CUED || event.data === window.YT.PlayerState.PLAYING) {
          const duration = event.target.getDuration();
          if (duration > 0 && Math.abs(duration - videoDurationSeconds) > 1) {
            videoDurationSeconds = duration;
            endInput.value = secondsToTime(videoDurationSeconds);
            configureFallbackRanges();
          }
        }
      },
      onError: async (event) => {
        const code = Number(event.data);
        if (code === 101 || code === 150) {
          // Embedding restricted
          showFallbackPanel(true);
          await fetchMetadataFallback("퍼가기 금지 영상입니다.");
          return;
        }
        if (code === 2) {
          setStatus("영상 URL/ID가 올바르지 않습니다.");
          return;
        }
        // Other errors
        await fetchMetadataFallback(`플레이어 오류(${code}).`);
      }
    }
  });
}

window.onYouTubeIframeAPIReady = () => { };


// Use existing variable
let autoLoadTimeout;

async function executeVideoLoad(url) {
  currentVideoUrl = url;
  const id = extractYouTubeId(currentVideoUrl);

  // Playlist check
  if (isYouTubePlaylistUrl(currentVideoUrl)) {
    setStatus("💡 재생목록 링크입니다. '재생목록 일괄 저장' 버튼으로 모두 대기 목록에 저장할 수 있어요.");
    setPlaylistMode(true);
    return;
  }

  setPlaylistMode(false);

  if (!id) {
    // Only show error status on manual interaction or clear status
    return;
  }

  setStatus("영상 정보를 불러오는 중... 🔄");

  // Player-First Strategy: Load player and metadata in parallel
  applyUrlTimes(currentVideoUrl);

  // Always fetch metadata for chapters
  const metadataPromise = loadVideoMetadata(currentVideoUrl);

  if (!window.YT || !window.YT.Player) {
    setStatus("플레이어 준비 중... 메타데이터를 먼저 가져옵니다.");
    await metadataPromise;
    return;
  }

  ensurePlayer(id);
  // Status will be updated by player events
}

// Use existing variable
urlInput.addEventListener("input", () => {
  const url = urlInput.value.trim();

  // Instant Playlist Feedback
  if (isYouTubePlaylistUrl(url)) {
    setStatus("💡 재생목록 링크입니다. 버튼을 누르면 전체 영상을 대기 목록에 저장합니다.");
    setPlaylistMode(true);
    return;
  } else {
    setPlaylistMode(false);
  }

  // Debounced Auto-Load
  clearTimeout(autoLoadTimeout);
  autoLoadTimeout = setTimeout(() => {
    const id = extractYouTubeId(url);
    if (id) {
      executeVideoLoad(url);
    }
  }, 700);
});

// Manual Trigger (Icon Button)
loadVideoButton.addEventListener("click", () => {
  const url = getCurrentFormUrl();
  if (!extractYouTubeId(url) && !isYouTubePlaylistUrl(url)) {
    setStatus("유효한 유튜브 링크를 입력하세요.");
    return;
  }
  executeVideoLoad(url);
});

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
  // Success feedback
  appendLog("도구 확인 완료.");
  return true;
}

async function addPlaylistToQueue(url) {
  setStatus("재생목록 정보 조회 중...");
  appendLog(`재생목록 조회: ${url}`);

  const items = await window.shokzApi.getPlaylistMetadata({ url });
  if (!items || items.length === 0) {
    setStatus("재생목록 정보를 가져오지 못했습니다.");
    appendLog("재생목록 항목이 없거나 yt-dlp 조회에 실패했습니다.");
    return 0;
  }

  if (!confirm(`총 ${items.length}개의 영상을 대기 목록에 일괄 저장하시겠습니까?`)) {
    setStatus("재생목록 저장 취소됨");
    return 0;
  }

  const now = Date.now();
  const queueItemsToAdd = [];
  const seenUrls = new Set(queueItems.map((item) => item.url));

  for (const item of items) {
    const itemUrl = item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : "");
    if (!itemUrl || seenUrls.has(itemUrl)) continue;
    seenUrls.add(itemUrl);
    queueItemsToAdd.push({
      id: `${now}_${queueItemsToAdd.length}_${Math.random().toString(16).slice(2)}`,
      url: itemUrl,
      title: item.title || itemUrl,
      outputName: sanitizeOutputName(item.title || item.id || "youtube"),
      startTime: "",
      endTime: "",
      status: "pending",
      message: "",
      createdAt: now + queueItemsToAdd.length
    });
  }

  if (queueItemsToAdd.length === 0) {
    setStatus("이미 저장된 재생목록입니다.");
    return 0;
  }

  addQueueItems(queueItemsToAdd);
  setStatus(`${queueItemsToAdd.length}개의 영상을 대기 목록에 저장했습니다.`);
  appendLog(`재생목록 저장 완료: ${queueItemsToAdd.length}개`);
  return queueItemsToAdd.length;
}



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
  if (isYouTubePlaylistUrl(url)) {
    const toolsReady = await ensureToolsReady();
    if (!toolsReady) return;

    try {
      downloadButton.disabled = true;
      setStatus("재생목록 전체 MP3 변환 중...");
      appendLog(`재생목록 바로 변환 시작: ${url}`);
      await window.shokzApi.downloadPlaylistMp3({ url, outputFolder });
      setStatus("완료: 재생목록 MP3 변환 성공");
      appendLog("재생목록 변환 완료");
      await refreshFiles();
    } catch (error) {
      setStatus("재생목록 변환 실패: 로그를 확인하세요.");
      appendLog(error.message);
    } finally {
      downloadButton.disabled = false;
      setPlaylistMode(true);
    }
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
    appendLog("완료");
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

  // Check for playlist
  if (isYouTubePlaylistUrl(url)) {
    try {
      addToQueueButton.disabled = true;
      await addPlaylistToQueue(url);
    } catch (error) {
      setStatus("재생목록 저장 실패: 로그를 확인하세요.");
      appendLog(error.message);
    } finally {
      addToQueueButton.disabled = false;
      setPlaylistMode(true);
    }
    return;
  }

  // Single video fallback
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

addChaptersToQueueButton.addEventListener("click", async () => {
  if (currentVideoChapters.length === 0) return;

  if (!confirm(`총 ${currentVideoChapters.length}개의 챕터를 '일괄 추출' 방식으로 대기열에 추가하시겠습니까?\n한 번에 다운로드하고 로컬에서 자동으로 분할하여 훨씬 빠릅니다.`)) {
    return;
  }

  const batchChapters = currentVideoChapters.map((chapter, i) => {
    const title = chapter.title || `${currentVideoTitle} - Part ${i + 1}`;
    return {
      startTime: secondsToTime(chapter.start_time),
      endTime: secondsToTime(chapter.end_time),
      outputName: sanitizeOutputName(title)
    };
  });

  addQueueItem({
    id: `${Date.now()}_batch`,
    url: currentVideoUrl,
    title: `[일괄] ${currentVideoTitle} (${batchChapters.length}개 챕터)`,
    outputName: sanitizeOutputName(currentVideoTitle),
    status: "pending",
    message: "",
    type: "chapter_batch",
    chapters: batchChapters,
    createdAt: Date.now()
  });

  setStatus(`${batchChapters.length}개 챕터를 일괄 항목으로 추가했습니다.`);
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
  window.shokzApi.onDownloadProgress((message) => {
    appendLog(message);
  });

  loadQueue();
  renderQueue();
  showFallbackPanel(false);
  configureFallbackRanges();

  await refreshDeviceOptions();
  await refreshFiles();
}

init();
