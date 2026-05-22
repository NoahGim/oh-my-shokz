const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shokzApi", {
  pickOutputFolder: () => ipcRenderer.invoke("pick-output-folder"),
  checkTools: () => ipcRenderer.invoke("check-tools"),
  installTools: () => ipcRenderer.invoke("install-tools"),
  getVideoMetadata: (payload) => ipcRenderer.invoke("get-video-metadata", payload),
  getPlaylistMetadata: (payload) => ipcRenderer.invoke("get-playlist-metadata", payload),
  downloadMp3: (payload) => ipcRenderer.invoke("download-mp3", payload),
  downloadPlaylistMp3: (payload) => ipcRenderer.invoke("download-playlist-mp3", payload),
  listMp3Files: (payload) => ipcRenderer.invoke("list-mp3-files", payload),
  detectShokzVolumes: () => ipcRenderer.invoke("detect-shokz-volumes"),
  copyFileToDevice: (payload) => ipcRenderer.invoke("copy-file-to-device", payload),
  downloadChaptersBatch: (payload) => ipcRenderer.invoke("download-chapters-batch", payload),
  openExternalUrl: (payload) => ipcRenderer.invoke("open-external-url", payload),
  onDownloadProgress: (callback) => ipcRenderer.on("download-progress", (_, message) => callback(message))
});
