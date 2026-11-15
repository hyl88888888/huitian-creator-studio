import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiRequest,
  AiSettings,
  AppData,
  ExportRequest,
  FileDialogRequest,
  RenderProgress,
  StudioApi
} from '../shared/types'

const api: StudioApi = {
  loadData: () => ipcRenderer.invoke('data:load') as Promise<AppData>,
  saveData: (data) => ipcRenderer.invoke('data:save', data) as Promise<void>,
  selectFiles: (request: FileDialogRequest) => ipcRenderer.invoke('files:select', request),
  chooseExportDirectory: () => ipcRenderer.invoke('export:choose-directory'),
  runAiTask: <T>(request: AiRequest) => ipcRenderer.invoke('ai:run', request) as Promise<T>,
  testAiConnection: (settings: AiSettings) => ipcRenderer.invoke('ai:test', settings),
  exportProject: (request: ExportRequest) => ipcRenderer.invoke('project:export', request),
  revealPath: (path: string) => ipcRenderer.invoke('path:reveal', path),
  onRenderProgress: (callback: (progress: RenderProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RenderProgress): void => callback(progress)
    ipcRenderer.on('render:progress', listener)
    return () => ipcRenderer.removeListener('render:progress', listener)
  },
  onAiFallback: (callback: (reason: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, reason: string): void => callback(reason)
    ipcRenderer.on('ai:fallback', listener)
    return () => ipcRenderer.removeListener('ai:fallback', listener)
  }
}

contextBridge.exposeInMainWorld('studio', api)
