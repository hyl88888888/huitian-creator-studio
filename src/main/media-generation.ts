import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

export interface MediaGenerationSettings {
  enabled?: boolean
  providerName?: string
  baseUrl?: string
  apiKey?: string
  autoGenerateMedia?: boolean
  imageModel?: string
  videoModel?: string
  preferVideoGeneration?: boolean
}

export interface ResolvedMediaGenerationSettings {
  enabled: boolean
  providerName: string
  apiRoot: string
  apiKey: string
  autoGenerateMedia: boolean
  imageModel: string
  videoModel: string
  preferVideoGeneration: boolean
}

export interface GeneratedMediaRecord {
  generated: true
  provider: string
  model: string
  prompt: string
  provenance: string
  mediaType: 'image' | 'video'
  path: string
  createdAt: string
  apiJobId?: string
}

export interface GenerateMediaRequest {
  prompt: string
  outputDirectory: string
  fileStem: string
  durationSeconds: number
  requiresMotion: boolean
  settings: MediaGenerationSettings
  /** Durable local state for resuming a paid video job after an interrupted export. */
  jobStateDirectory?: string
}

export interface MediaGenerationDependencies {
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  pollIntervalMs?: number
  maxPollAttempts?: number
}

const defaultApiRoot = 'https://api.openai.com/v1'
const maxProviderDetailLength = 240

type ErrorWithApiJobId = Error & { apiJobId?: string }

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function validatedServiceUrl(value: string, label = '接口地址'): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(`${label}无效，请填写完整的 HTTPS 地址。`)
  }
  if (url.username || url.password) {
    throw new Error(`${label}不能包含用户名或密码。`)
  }
  const secure = url.protocol === 'https:'
    || (url.protocol === 'http:' && isLoopbackHostname(url.hostname))
  if (!secure) {
    throw new Error(`为保护密钥，${label}必须使用 HTTPS；只有本机 localhost、127.0.0.1 或 ::1 可以使用 HTTP。`)
  }
  return url
}

function redactSensitiveText(value: string, apiKey: string): string {
  let safe = value.replace(/\bBearer\s+(?:"[^"]*"|'[^']*'|[^\s"',;)}\]]+)/gi, '[已隐藏凭据]')
  const key = apiKey.trim()
  if (key) safe = safe.split(key).join('[已隐藏密钥]')
  safe = safe
    .replace(/\bsk-[a-z0-9_-]{6,}\b/gi, '[已隐藏密钥]')
    .replace(/((?:api[_-]?key|authorization|access[_-]?token)\s*[=:]\s*)[^\s,;)}\]]+/gi, '$1[已隐藏]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return safe.slice(0, maxProviderDetailLength)
}

function providerMessageFromPayload(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const record = payload as Record<string, unknown>
  const error = record.error
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  for (const field of ['message', 'detail', 'error_description']) {
    if (typeof record[field] === 'string') return record[field] as string
  }
  return ''
}

async function safeProviderDetail(response: Response, apiKey: string): Promise<string> {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    return ''
  }
  let detail = ''
  try {
    detail = providerMessageFromPayload(JSON.parse(raw))
  } catch {
    // A short plain-text provider message is useful; markup and JSON blobs are not.
    if (!/^\s*[<{[]/.test(raw)) detail = raw
  }
  return redactSensitiveText(detail, apiKey)
}

function safeError(error: unknown, apiKey: string, fallback = '云端素材服务请求失败。'): ErrorWithApiJobId {
  const source = error instanceof Error ? error.message : String(error ?? '')
  const result = new Error(redactSensitiveText(source, apiKey) || fallback) as ErrorWithApiJobId
  const apiJobId = typeof error === 'object' && error !== null
    ? (error as { apiJobId?: unknown }).apiJobId
    : undefined
  if (typeof apiJobId === 'string' && apiJobId) result.apiJobId = apiJobId
  return result
}

function withApiJobId(error: unknown, apiJobId: string, apiKey: string): ErrorWithApiJobId {
  const result = safeError(error, apiKey)
  result.apiJobId = apiJobId
  return result
}

function apiRootFrom(value: string | undefined): string {
  const input = value?.trim() || defaultApiRoot
  const url = validatedServiceUrl(input)
  url.search = ''
  url.hash = ''
  const segments = url.pathname.split('/').filter(Boolean)
  const versionIndex = segments.lastIndexOf('v1')
  if (versionIndex >= 0) {
    url.pathname = `/${segments.slice(0, versionIndex + 1).join('/')}`
  } else {
    const knownEndpoints = new Set(['chat', 'responses', 'images', 'videos'])
    const knownEndpoint = segments.findIndex((segment) => knownEndpoints.has(segment))
    const baseSegments = knownEndpoint >= 0 ? segments.slice(0, knownEndpoint) : segments
    url.pathname = `/${[...baseSegments, 'v1'].join('/')}`
  }
  return url.toString().replace(/\/$/, '')
}

export function resolveMediaGenerationSettings(
  settings: MediaGenerationSettings
): ResolvedMediaGenerationSettings {
  return {
    enabled: settings.enabled === true,
    providerName: settings.providerName?.trim() || 'OpenAI API',
    apiRoot: apiRootFrom(settings.baseUrl),
    apiKey: settings.apiKey?.trim() || '',
    // Missing fields are intentionally off so old projects never incur surprise API charges.
    autoGenerateMedia: settings.autoGenerateMedia === true,
    imageModel: settings.imageModel?.trim() || 'gpt-image-2',
    videoModel: settings.videoModel?.trim() || 'sora-2-pro',
    preferVideoGeneration: settings.preferVideoGeneration === true
  }
}

export function canGenerateMedia(settings: MediaGenerationSettings): boolean {
  try {
    const resolved = resolveMediaGenerationSettings(settings)
    return resolved.enabled && resolved.autoGenerateMedia && Boolean(resolved.apiKey)
  } catch {
    return false
  }
}

function providerLabel(settings: ResolvedMediaGenerationSettings): string {
  try {
    return new URL(settings.apiRoot).hostname.toLowerCase() === 'api.openai.com'
      ? 'OpenAI API'
      : settings.providerName
  } catch {
    return settings.providerName
  }
}

function authorizationHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` }
}

async function responseError(response: Response, operation: string, apiKey: string): Promise<Error> {
  const detail = await safeProviderDetail(response, apiKey)
  return new Error(`${operation}失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
}

async function generateImage(
  request: GenerateMediaRequest,
  settings: ResolvedMediaGenerationSettings,
  fetchImpl: typeof fetch
): Promise<GeneratedMediaRecord> {
  const response = await fetchImpl(`${settings.apiRoot}/images/generations`, {
    method: 'POST',
    headers: {
      ...authorizationHeaders(settings.apiKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.imageModel,
      prompt: request.prompt,
      n: 1,
      // gpt-image-2 accepts custom dimensions whose edges are multiples of 16.
      // 1024x1792 is a near-9:16 portrait frame and is cropped to 1080x1920 at render time.
      size: '1024x1792',
      quality: 'high',
      output_format: 'png'
    }),
    signal: AbortSignal.timeout(240_000)
  })
  if (!response.ok) throw await responseError(response, '原创图片生成', settings.apiKey)

  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>
  }
  const item = payload.data?.[0]
  let bytes: Buffer
  if (item?.b64_json) {
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (item?.url) {
    const downloadUrl = validatedServiceUrl(item.url, '图片下载地址').toString()
    const download = await fetchImpl(downloadUrl, { signal: AbortSignal.timeout(120_000) })
    if (!download.ok) throw await responseError(download, '原创图片下载', settings.apiKey)
    bytes = Buffer.from(await download.arrayBuffer())
  } else {
    throw new Error('原创图片生成成功，但接口没有返回可下载的图片。')
  }
  if (!bytes.length) throw new Error('原创图片接口返回了空文件。')

  await fs.mkdir(request.outputDirectory, { recursive: true })
  const path = join(request.outputDirectory, `${request.fileStem}_original-image.png`)
  await fs.writeFile(path, bytes)
  return {
    generated: true,
    provider: providerLabel(settings),
    model: settings.imageModel,
    prompt: request.prompt,
    provenance: 'remote-api-generated',
    mediaType: 'image',
    path,
    createdAt: new Date().toISOString()
  }
}

interface VideoJob {
  id?: string
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'expired' | 'cancelled'
  error?: { message?: string } | string
}

interface PendingVideoJobState {
  jobId: string
  model: string
  createdAt: string
}

function supportedVideoSeconds(durationSeconds: number): '4' | '8' | '12' {
  if (durationSeconds <= 4) return '4'
  if (durationSeconds <= 8) return '8'
  return '12'
}

function pendingVideoJobPath(
  request: GenerateMediaRequest,
  settings: ResolvedMediaGenerationSettings,
  size: string,
  seconds: string
): string | undefined {
  if (!request.jobStateDirectory?.trim()) return undefined
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([
      settings.apiRoot,
      settings.videoModel,
      request.prompt,
      size,
      seconds
    ]))
    .digest('hex')
  return join(request.jobStateDirectory, `${fingerprint}.json`)
}

async function readPendingVideoJob(path: string | undefined): Promise<PendingVideoJobState | undefined> {
  if (!path) return undefined
  try {
    const value = JSON.parse(await fs.readFile(path, 'utf8')) as Partial<PendingVideoJobState>
    if (typeof value.jobId !== 'string' || !value.jobId.trim() || value.jobId.length > 512) {
      throw new Error('任务号无效')
    }
    return {
      jobId: value.jobId,
      model: typeof value.model === 'string' ? value.model : '',
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : ''
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('本地视频任务恢复信息已损坏。为避免重复付费，未创建新任务。')
  }
}

async function writePendingVideoJob(path: string | undefined, state: PendingVideoJobState): Promise<void> {
  if (!path) return
  await fs.mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(state), 'utf8')
    await fs.rename(temporaryPath, path)
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function removePendingVideoJob(path: string | undefined): Promise<void> {
  if (!path) return
  try {
    await fs.unlink(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function generateVideo(
  request: GenerateMediaRequest,
  settings: ResolvedMediaGenerationSettings,
  fetchImpl: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
  pollIntervalMs: number,
  maxPollAttempts: number
): Promise<GeneratedMediaRecord> {
  const size = '1024x1792'
  const seconds = supportedVideoSeconds(request.durationSeconds || 4)
  const form = new FormData()
  form.set('model', settings.videoModel)
  form.set('prompt', request.prompt)
  // Use the request-schema values accepted by the endpoint; export crops to 1080x1920.
  form.set('size', size)
  form.set('seconds', seconds)

  const pendingPath = pendingVideoJobPath(request, settings, size, seconds)
  const pending = await readPendingVideoJob(pendingPath)
  let job: VideoJob
  if (pending) {
    job = { id: pending.jobId, status: 'queued' }
  } else {
    const start = await fetchImpl(`${settings.apiRoot}/videos`, {
      method: 'POST',
      headers: authorizationHeaders(settings.apiKey),
      body: form,
      signal: AbortSignal.timeout(120_000)
    })
    if (!start.ok) throw await responseError(start, '原创视频任务创建', settings.apiKey)
    job = await start.json() as VideoJob
    if (!job.id) throw new Error('原创视频任务没有返回任务 ID。')
    try {
      await writePendingVideoJob(pendingPath, {
        jobId: job.id,
        model: settings.videoModel,
        createdAt: new Date().toISOString()
      })
    } catch (error) {
      throw withApiJobId(error, job.id, settings.apiKey)
    }
  }
  const jobId = job.id as string
  if (!job.status) job.status = 'queued'

  try {
    let attempts = 0
    while (job.status === 'queued' || job.status === 'in_progress') {
      if (attempts >= maxPollAttempts) throw new Error('原创视频生成等待超时，已切换到本地原创画面。')
      attempts += 1
      await sleep(pollIntervalMs)
      const status = await fetchImpl(`${settings.apiRoot}/videos/${encodeURIComponent(jobId)}`, {
        headers: authorizationHeaders(settings.apiKey),
        signal: AbortSignal.timeout(30_000)
      })
      if (!status.ok) throw await responseError(status, '原创视频进度查询', settings.apiKey)
      job = await status.json() as VideoJob
    }
    if (job.status !== 'completed') {
      const detail = typeof job.error === 'string' ? job.error : job.error?.message
      const safeDetail = detail ? redactSensitiveText(detail, settings.apiKey) : ''
      throw new Error(`原创视频生成未完成（${job.status || '未知状态'}）${safeDetail ? `：${safeDetail}` : ''}`)
    }

    const download = await fetchImpl(`${settings.apiRoot}/videos/${encodeURIComponent(jobId)}/content`, {
      headers: authorizationHeaders(settings.apiKey),
      signal: AbortSignal.timeout(240_000)
    })
    if (!download.ok) throw await responseError(download, '原创视频下载', settings.apiKey)
    const bytes = Buffer.from(await download.arrayBuffer())
    if (!bytes.length) throw new Error('原创视频接口返回了空文件。')

    await fs.mkdir(request.outputDirectory, { recursive: true })
    const path = join(request.outputDirectory, `${request.fileStem}_original-video.mp4`)
    await fs.writeFile(path, bytes)
    await removePendingVideoJob(pendingPath)
    return {
      generated: true,
      provider: providerLabel(settings),
      model: settings.videoModel,
      prompt: request.prompt,
      provenance: `remote-api-generated:${jobId}`,
      mediaType: 'video',
      path,
      createdAt: new Date().toISOString(),
      apiJobId: jobId
    }
  } catch (error) {
    throw withApiJobId(error, jobId, settings.apiKey)
  }
}

export async function generateOpenAiMedia(
  request: GenerateMediaRequest,
  dependencies: MediaGenerationDependencies = {}
): Promise<GeneratedMediaRecord> {
  const settings = resolveMediaGenerationSettings(request.settings)
  if (!settings.enabled || !settings.autoGenerateMedia || !settings.apiKey) {
    throw new Error('云端原创素材生成未启用。')
  }
  const fetchImpl = dependencies.fetch ?? fetch
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  try {
    if (request.requiresMotion && settings.preferVideoGeneration) {
      return await generateVideo(
        request,
        settings,
        fetchImpl,
        sleep,
        dependencies.pollIntervalMs ?? 12_000,
        dependencies.maxPollAttempts ?? 50
      )
    }
    return await generateImage(request, settings, fetchImpl)
  } catch (error) {
    throw safeError(error, settings.apiKey)
  }
}
