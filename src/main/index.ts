import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { join } from 'node:path'
import { runAiTask, testConnection } from './ai'
import { learnPreferenceMemory } from './creative-engine'
import { chooseExportDirectory, exportProject, registerMediaProtocol, reveal, selectMediaFiles } from './media'
import {
  loadAppData,
  loadCreatorPreferenceMemory,
  saveAppData,
  saveCreatorPreferenceMemory
} from './store'
import type { AiRequest, AiSettings, AppData, ExportRequest, FileDialogRequest } from '../shared/types'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
const storedSecretPlaceholder = '••••••••••••'

function withRedactedSecret(data: AppData): AppData {
  return {
    ...data,
    settings: {
      ...data.settings,
      ai: {
        ...data.settings.ai,
        apiKey: data.settings.ai.apiKey ? storedSecretPlaceholder : ''
      }
    }
  }
}

async function withStoredSecret(settings: AiSettings): Promise<AiSettings> {
  if (settings.apiKey !== storedSecretPlaceholder) return settings
  const stored = await loadAppData()
  return { ...settings, apiKey: stored.settings.ai.apiKey }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#090b10',
    title: '回天创作台',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (current && url !== current) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('data:load', async () => withRedactedSecret(await loadAppData()))
  ipcMain.handle('data:save', async (_event, data: AppData) => {
    const ai = await withStoredSecret(data.settings.ai)
    return saveAppData({ ...data, settings: { ...data.settings, ai } })
  })
  ipcMain.handle('files:select', (_event, request: FileDialogRequest) => selectMediaFiles(request))
  ipcMain.handle('export:choose-directory', () => chooseExportDirectory())
  ipcMain.handle('ai:run', async (event, request: AiRequest) => {
    const data = await loadAppData()
    const storedMemory = await loadCreatorPreferenceMemory(request.project.profileId)
    const memory = learnPreferenceMemory(storedMemory, request)
    if (memory.observations !== storedMemory.observations || memory.updatedAt !== storedMemory.updatedAt) {
      await saveCreatorPreferenceMemory(memory)
    }
    const result = await runAiTask<unknown>(request, data.settings.ai, memory)
    if (typeof result === 'object' && result !== null && '__fallbackReason' in result) {
      event.sender.send('ai:fallback', String((result as { __fallbackReason?: unknown }).__fallbackReason ?? '未知错误'))
    }
    return result
  })
  ipcMain.handle('ai:test', async (_event, settings: AiSettings) => testConnection(await withStoredSecret(settings)))
  ipcMain.handle('project:export', async (_event, request: ExportRequest) => {
    // loadAppData returns the API key only after Windows safeStorage decrypts it in memory.
    // exportProject never persists the key or places it in an export manifest.
    const data = await loadAppData()
    return exportProject(request, mainWindow, data.settings.ai)
  })
  ipcMain.handle('path:reveal', (_event, path: string) => reveal(path))
}

app.whenReady().then(() => {
  registerMediaProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
