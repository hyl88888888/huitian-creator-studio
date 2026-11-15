import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AiSettings, AppData, AppSettings, CreatorPreferenceMemory, IpProfile } from '../shared/types'
import { createEmptyPreferenceMemory } from './creative-engine'

const defaultSettings: AppSettings = {
  ai: {
    providerName: '回天高级文案大脑',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-5.6',
    imageModel: 'gpt-image-2',
    videoModel: 'sora-2-pro',
    temperature: 0.72,
    enabled: false,
    // Generated video can be expensive, so every user explicitly opts in.
    autoGenerateMedia: false,
    preferVideoGeneration: false
  },
  defaultExportDirectory: '',
  autoSave: true,
  defaultVisualPreset: 'dense-light'
}

function normalizeAiSettings(value: Partial<AiSettings> | undefined, apiKey: string): AiSettings {
  const stored = value ?? {}
  const nonEmpty = (candidate: unknown, fallback: string): string =>
    typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback

  return {
    ...defaultSettings.ai,
    ...stored,
    providerName: nonEmpty(stored.providerName, defaultSettings.ai.providerName),
    baseUrl: nonEmpty(stored.baseUrl, defaultSettings.ai.baseUrl),
    model: nonEmpty(stored.model, defaultSettings.ai.model),
    imageModel: nonEmpty(stored.imageModel, defaultSettings.ai.imageModel),
    videoModel: nonEmpty(stored.videoModel, defaultSettings.ai.videoModel),
    temperature: typeof stored.temperature === 'number' && Number.isFinite(stored.temperature)
      ? stored.temperature
      : defaultSettings.ai.temperature,
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : defaultSettings.ai.enabled,
    autoGenerateMedia: typeof stored.autoGenerateMedia === 'boolean'
      ? stored.autoGenerateMedia
      : defaultSettings.ai.autoGenerateMedia,
    preferVideoGeneration: typeof stored.preferVideoGeneration === 'boolean'
      ? stored.preferVideoGeneration
      : defaultSettings.ai.preferVideoGeneration,
    apiKey
  }
}

function seedProfile(): IpProfile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '我的个人IP',
    identity: '',
    audience: '',
    beliefs: '',
    voice: '真诚、具体、有观点，像和一个真实的人聊天',
    experiences: '',
    preferredPhrases: '',
    forbiddenPhrases: '空洞口号、爹味说教、为了关联而机械重复“你”',
    visualStyle: '浅色高密度爆款风：强标题层级、短字幕、证据截图与快速切换；信息多但构图有秩序，人物仍是信任主体。既学习南门录像厅、路过我的生活、GenJi、小小小小fish（抖音号163431421）、Z嗯（抖音号69151059776）的共同节奏与信息组织，也把可验证的独特画面拆成原创制作语法；不复制原句、人物、素材或具体镜头。',
    createdAt: now,
    updatedAt: now
  }
}

function defaultData(): AppData {
  return {
    projects: [],
    profiles: [seedProfile()],
    settings: defaultSettings,
    version: 2
  }
}

function dataPath(): string {
  return join(app.getPath('userData'), 'studio-data.json')
}

function secretPath(): string {
  return join(app.getPath('userData'), 'studio-secret.bin')
}

function preferencePath(): string {
  return join(app.getPath('userData'), 'creator-preferences.json')
}

interface PreferenceStore {
  version: 1
  memories: Record<string, CreatorPreferenceMemory>
}

function validStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(-30)
    : []
}

function normalizeMemory(value: unknown, profileId?: string): CreatorPreferenceMemory {
  const fallback = createEmptyPreferenceMemory(profileId)
  if (!value || typeof value !== 'object') return fallback
  const stored = value as Partial<CreatorPreferenceMemory>
  return {
    key: typeof stored.key === 'string' && stored.key ? stored.key : fallback.key,
    profileId: typeof stored.profileId === 'string' ? stored.profileId : profileId,
    preferredExamples: validStrings(stored.preferredExamples),
    rejectedExamples: validStrings(stored.rejectedExamples),
    directives: validStrings(stored.directives),
    observations: typeof stored.observations === 'number' && Number.isFinite(stored.observations)
      ? Math.max(0, Math.round(stored.observations))
      : 0,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : fallback.updatedAt
  }
}

async function readPreferenceStore(): Promise<PreferenceStore> {
  const target = preferencePath()
  for (const candidate of [target, `${target}.bak`]) {
    try {
      const raw = JSON.parse(await fs.readFile(candidate, 'utf8')) as Partial<PreferenceStore>
      if (raw.memories && typeof raw.memories === 'object') {
        return { version: 1, memories: raw.memories as Record<string, CreatorPreferenceMemory> }
      }
    } catch {
      // Try the backup before starting with an empty preference memory.
    }
  }
  return { version: 1, memories: {} }
}

export async function loadCreatorPreferenceMemory(profileId?: string): Promise<CreatorPreferenceMemory> {
  const store = await readPreferenceStore()
  const key = profileId || 'global'
  return normalizeMemory(store.memories[key], profileId)
}

export async function saveCreatorPreferenceMemory(memory: CreatorPreferenceMemory): Promise<void> {
  const target = preferencePath()
  const temporary = `${target}.tmp`
  const store = await readPreferenceStore()
  store.memories[memory.key] = normalizeMemory(memory, memory.profileId)
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
  try {
    await fs.copyFile(target, `${target}.bak`)
  } catch {
    // The first save has no previous file to back up.
  }
  await fs.rename(temporary, target)
}

async function readSecret(): Promise<string> {
  try {
    const encrypted = await fs.readFile(secretPath())
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encrypted)
    }
    return ''
  } catch {
    return ''
  }
}

async function writeSecret(secret: string): Promise<void> {
  const target = secretPath()
  await fs.mkdir(dirname(target), { recursive: true })
  if (!secret) {
    await fs.rm(target, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统无法安全保存模型密钥，请稍后重试。')
  }
  await fs.writeFile(target, safeStorage.encryptString(secret))
}

export async function loadAppData(): Promise<AppData> {
  const defaults = defaultData()
  const target = dataPath()
  for (const candidate of [target, `${target}.bak`]) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      const stored = JSON.parse(raw) as Partial<AppData>
      const apiKey = await readSecret()
      return {
        projects: Array.isArray(stored.projects) ? stored.projects : [],
        profiles: Array.isArray(stored.profiles) && stored.profiles.length > 0 ? stored.profiles : defaults.profiles,
        settings: {
          ...defaultSettings,
          ...(stored.settings ?? {}),
          ai: normalizeAiSettings(stored.settings?.ai, apiKey)
        },
        version: 2
      }
    } catch {
      // Try the backup before creating a new workspace.
    }
  }
  return defaults
}

export async function saveAppData(data: AppData): Promise<void> {
  const target = dataPath()
  const temporary = `${target}.tmp`
  await fs.mkdir(dirname(target), { recursive: true })
  await writeSecret(data.settings.ai.apiKey)
  const serializable: AppData = {
    ...data,
    settings: {
      ...data.settings,
      ai: {
        ...data.settings.ai,
        apiKey: ''
      }
    }
  }
  await fs.writeFile(temporary, JSON.stringify(serializable, null, 2), 'utf8')
  try {
    await fs.copyFile(target, `${target}.bak`)
  } catch {
    // The first save has no previous file to back up.
  }
  await fs.rename(temporary, target)
}
