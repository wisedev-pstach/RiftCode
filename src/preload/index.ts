import { contextBridge, ipcRenderer } from "electron";
import type { RiftApi } from "../shared/contracts";

const api: RiftApi = {
  platform: process.platform as RiftApi["platform"],
  openRepository: (path) => ipcRenderer.invoke("repository:open", path),
  refreshRepository: () => ipcRenderer.invoke("repository:refresh"),
  getFilePatch: (path) => ipcRenderer.invoke("repository:patch", path),
  chooseRepository: () => ipcRenderer.invoke("repository:choose"),
  selectComparison: (id) => ipcRenderer.invoke("repository:compare", id),
  listAgents: () => ipcRenderer.invoke("agent:list"),
  listAgentModels: (id) => ipcRenderer.invoke("agent:models", id),
  listAgentSessions: (id) => ipcRenderer.invoke("agent:sessions", id),
  getAgentSession: (id, sessionId) => ipcRenderer.invoke("agent:session", id, sessionId),
  runAgent: (runId, id, model, prompt, sessionId) => ipcRenderer.invoke("agent:run", runId, id, model, prompt, sessionId),
  cancelAgent: () => ipcRenderer.invoke("agent:cancel"),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  onRepositoryChanged: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on("repository:changed", handler);
    return () => ipcRenderer.removeListener("repository:changed", handler);
  },
  onAgentEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]): void => listener(value);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  }
};

contextBridge.exposeInMainWorld("rift", api);
