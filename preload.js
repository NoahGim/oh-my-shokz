const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shokzApi", {
  pickOutputFolder: () => ipcRenderer.invoke("pick-output-folder"),
  checkTools: () => ipcRenderer.invoke("check-tools"),
  installTools: () => ipcRenderer.invoke("install-tools"),
  downloadMp3: (payload) => ipcRenderer.invoke("download-mp3", payload),
  listMp3Files: (payload) => ipcRenderer.invoke("list-mp3-files", payload),
  detectShokzVolumes: () => ipcRenderer.invoke("detect-shokz-volumes"),
  copyFileToDevice: (payload) => ipcRenderer.invoke("copy-file-to-device", payload),
  openExternalUrl: (payload) => ipcRenderer.invoke("open-external-url", payload)
});
