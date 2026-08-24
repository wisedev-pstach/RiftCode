import { contextBridge, ipcRenderer } from "electron";
import type { RiftApi } from "../shared/contracts";

const api: RiftApi = {
  platform: process.platform as RiftApi["platform"],
  openRepository: (path) => ipcRenderer.invoke("repository:open", path),
  refreshRepository: () => ipcRenderer.invoke("repository:refresh"),
  getFilePatch: (path) => ipcRenderer.invoke("repository:patch", path),
  chooseRepository: () => ipcRenderer.invoke("repository:choose"),
  selectComparison: (id) => ipcRenderer.invoke("repository:compare", id),
  onRepositoryChanged: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on("repository:changed", handler);
    return () => ipcRenderer.removeListener("repository:changed", handler);
  }
};

contextBridge.exposeInMainWorld("rift", api);
