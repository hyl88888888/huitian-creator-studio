import { app, BrowserWindow, dialog, nativeImage, net, protocol, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createReadStream, promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ZipArchive } from 'archiver'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import {
  canGenerateMedia,
  generateOpenAiMedia,
  type GeneratedMediaRecord,
  type MediaGenerationSettings
} from './media-generation'
import type {
  ExportRequest,
  ExportResult,
  FileDialogRequest,
  MediaAsset,
  Project,
  RenderProgress,
  StoryboardShot
} from '../shared/types'

const videoExtensions = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])
const audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'])
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

function packagedBinary(binaryPath: string): string {
  return binaryPath.replace('app.asar', 'app.asar.unpacked')
}

function ffmpegPath(): string {
  if (!ffmpegStatic) throw new Error('没有找到内置 FFmpeg。')
  return packagedBinary(ffmpegStatic)
}

function ffprobePath(): string {
  return packagedBinary(ffprobeStatic.path)
}

function mediaUri(path: string): string {
  return `local-media://file/${Buffer.from(path, 'utf8').toString('base64url')}`
}

function mimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  }
  return map[extension] ?? 'application/octet-stream'
}

function run(binary: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { windowsHide: true, cwd })
    let stdout = ''
    let stderr = ''
    process.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    process.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    process.on('error', reject)
    process.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.slice(-1600) || `命令失败，退出码 ${code}`))
    })
  })
}

async function probe(path: string): Promise<Partial<MediaAsset>> {
  try {
    const raw = await run(ffprobePath(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      path
    ])
    const data = JSON.parse(raw) as {
      format?: { duration?: string }
      streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>
    }
    const video = data.streams?.find((stream) => stream.codec_type === 'video')
    return {
      duration: Number(data.format?.duration ?? video?.duration ?? 0) || undefined,
      width: video?.width,
      height: video?.height
    }
  } catch {
    return {}
  }
}

function filtersFor(kind: FileDialogRequest['kind']): Electron.FileFilter[] {
  if (kind === 'audio') return [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
  if (kind === 'screenshot' || kind === 'image') return [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }]
  return [
    { name: '视频和图片', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'jpg', 'jpeg', 'png', 'webp'] }
  ]
}

export async function selectMediaFiles(request: FileDialogRequest): Promise<MediaAsset[]> {
  const result = await dialog.showOpenDialog({
    title: request.kind === 'reference' ? '选择对标视频' : '选择素材',
    properties: ['openFile', ...(request.multiple === false ? [] : ['multiSelections' as const])],
    filters: filtersFor(request.kind)
  })
  if (result.canceled) return []
  return Promise.all(result.filePaths.map(async (path) => {
    const stat = await fs.stat(path)
    const extension = extname(path).toLowerCase()
    const metadata = videoExtensions.has(extension) || audioExtensions.has(extension)
      ? await probe(path)
      : imageExtensions.has(extension)
        ? (() => {
            const size = nativeImage.createFromPath(path).getSize()
            return { width: size.width, height: size.height }
          })()
        : {}
    return {
      id: crypto.randomUUID(),
      name: basename(path),
      path,
      uri: mediaUri(path),
      kind: request.kind,
      mimeType: mimeType(path),
      size: stat.size,
      status: 'ready',
      ...metadata
    } satisfies MediaAsset
  }))
}

export function registerMediaProtocol(): void {
  protocol.handle('local-media', async (request) => {
    try {
      const url = new URL(request.url)
      const token = url.pathname.replace(/^\//, '')
      const filePath = Buffer.from(token, 'base64url').toString('utf8')
      return net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function safeName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim()
  return cleaned.slice(0, 64) || '未命名项目'
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function createSrt(shots: StoryboardShot[]): string {
  let cursor = 0
  return shots.map((shot, index) => {
    const start = cursor
    cursor += Math.max(0.8, shot.duration)
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(cursor)}\n${shot.subtitle.trim() || shot.scriptText.trim()}\n`
  }).join('\n')
}

function formatAssTime(seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100))
  const hours = Math.floor(totalCentiseconds / 360_000)
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000)
  const secs = Math.floor((totalCentiseconds % 6_000) / 100)
  const centiseconds = totalCentiseconds % 100
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

function wrapCaption(text: string, maxCharacters = 14): string {
  const compact = text.trim().replace(/\s+/g, '')
  if (compact.length <= maxCharacters) return compact
  const lines: string[] = []
  let remaining = compact
  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 3)
    const punctuation = Math.max(
      window.lastIndexOf('，'),
      window.lastIndexOf('。'),
      window.lastIndexOf('？'),
      window.lastIndexOf('！'),
      window.lastIndexOf('：'),
      window.lastIndexOf('；')
    )
    const splitAt = punctuation >= Math.floor(maxCharacters * 0.58) ? punctuation + 1 : maxCharacters
    lines.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt)
  }
  if (remaining) lines.push(remaining)
  return lines.slice(0, 3).join('\n')
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '＼').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N')
}

function captionRole(project: Project, shot: StoryboardShot): string {
  const script = project.scriptVersions.find((item) => item.id === project.activeScriptId) ?? project.scriptVersions.at(-1)
  const sentence = script?.sentences.find((item) => shot.sentenceIds.includes(item.id))
  return sentence?.role ?? 'situation'
}

function emphasizeCaption(text: string, role: string): string {
  const accent = role === 'loss' || role === 'emotion' ? '&H006E65FF&' : role === 'evidence' ? '&H00B0D334&' : '&H001A7AFF&'
  const candidates = ['不是', '而是', '真正', '千万别', '关键', '结果', '代价', '害怕', '可是', '所以', '现在', '一定']
  const target = candidates.find((word) => text.includes(word)) ?? text.match(/\d+(?:\.\d+)?%?/)?.[0]
  if (!target) return text
  return text.replace(target, `{\\c${accent}\\b1}${target}{\\r}`)
}

function createStyledAss(shots: StoryboardShot[], project: Project): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,66,&H00FFFFFF,&H001A7AFF,&HAA080A0F,&H70080A0F,-1,0,0,0,100,100,1,0,1,5,1,2,90,90,230,1
Style: Hook,Microsoft YaHei,76,&H00FFFFFF,&H001A7AFF,&HBB080A0F,&H78080A0F,-1,0,0,0,100,100,1,0,1,6,2,2,80,80,250,1
Style: Emotion,Microsoft YaHei,68,&H00FFFFFF,&H006E65FF,&HBB090A10,&H78090A10,-1,0,0,0,100,100,1,0,1,5,2,2,90,90,235,1
Style: Evidence,Microsoft YaHei,64,&H00FFFFFF,&H00B0D334,&HBB08100F,&H7808100F,-1,0,0,0,100,100,1,0,1,5,2,2,90,90,235,1
Style: Quote,Microsoft YaHei,82,&H00FFFFFF,&H001A7AFF,&HCC090B10,&H98090B10,-1,0,0,0,100,100,2,0,3,4,0,5,110,110,0,1
Style: CTA,Microsoft YaHei,70,&H00100B07,&H00FFFFFF,&H001A7AFF,&H001A7AFF,-1,0,0,0,100,100,1,0,3,9,0,2,120,120,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
  let cursor = 0
  const events = shots.map((shot, index) => {
    const start = cursor
    cursor += Math.max(0.8, shot.duration)
    const role = captionRole(project, shot)
    const style = shot.visualType === 'quote-card' || role === 'turn'
      ? 'Quote'
      : role === 'cta'
        ? 'CTA'
        : role === 'loss' || role === 'emotion'
          ? 'Emotion'
          : role === 'evidence'
            ? 'Evidence'
            : index === 0
              ? 'Hook'
              : 'Default'
    const raw = escapeAssText(wrapCaption(shot.subtitle.trim() || shot.scriptText.trim(), style === 'Quote' ? 11 : 14))
    const emphasized = emphasizeCaption(raw, role)
    const entrance = style === 'Quote'
      ? '{\\an5\\pos(540,900)\\fad(180,160)\\fscx108\\fscy108\\t(0,220,\\fscx100\\fscy100)}'
      : '{\\fad(90,120)\\fscx104\\fscy104\\t(0,160,\\fscx100\\fscy100)}'
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(cursor)},${style},,0,0,0,,${entrance}${emphasized}`
  })
  return `\uFEFF${header}\n${events.join('\n')}\n`
}

interface GeneratedVisual extends GeneratedMediaRecord {
  shotId: string
  fallbackReason?: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function displayLines(value: string, maxCharacters: number, maxLines = 4): string[] {
  return wrapCaption(value, maxCharacters)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
}

function balancedHeadlineLines(value: string): string[] {
  const compact = value.trim().replace(/\s+/g, '')
  if (compact.length <= 8) return [compact]
  const splitAt = Math.ceil(Math.min(16, compact.length) / 2)
  return [compact.slice(0, splitAt), compact.slice(splitAt, 16)].filter(Boolean)
}

function visualKeyword(value: string): string {
  const segments = value
    .split(/[，。！？；：,.!?;:]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
  const selected = segments.find((item) => item.length >= 5 && item.length <= 15)
    ?? segments.sort((a, b) => b.length - a.length)[0]
    ?? value.trim()
  return selected.length > 16 ? `${selected.slice(0, 15)}…` : selected
}

function visualPalette(role: string, index: number): { accent: string; glow: string; label: string } {
  if (role === 'loss' || role === 'emotion') return { accent: '#E5484D', glow: '#FFD9D6', label: 'TENSION' }
  if (role === 'evidence') return { accent: '#078B67', glow: '#D8F1E6', label: 'EVIDENCE' }
  if (role === 'turn') return { accent: '#1769D2', glow: '#DDE8FA', label: 'TURNING POINT' }
  if (role === 'cta') return { accent: '#F07825', glow: '#FFE2C9', label: 'NEXT MOVE' }
  if (index === 0) return { accent: '#FF5B2D', glow: '#FFD9CD', label: 'OPENING' }
  return { accent: '#D96D24', glow: '#F7E2CC', label: 'INSIGHT' }
}

type VisualGrammarName =
  | 'dense-explainer'
  | 'masked-typography'
  | 'motivated-montage'
  | 'photo-transformation'
  | 'editorial-life'
  | 'spatial-stage'
  | 'practical-demo'

interface VisualPlanLike {
  grammar?: VisualGrammarName
  supportingGrammars?: VisualGrammarName[]
  blendRationale?: string
  semanticReason?: string
  buildSteps?: string[]
}

const visualGrammarNames = new Set<VisualGrammarName>([
  'dense-explainer',
  'masked-typography',
  'motivated-montage',
  'photo-transformation',
  'editorial-life',
  'spatial-stage',
  'practical-demo'
])

const visualGrammarLabels: Record<VisualGrammarName, string> = {
  'dense-explainer': 'DENSE EXPLAINER',
  'masked-typography': 'MASKED TYPOGRAPHY',
  'motivated-montage': 'MOTIVATED MONTAGE',
  'photo-transformation': 'PHOTO TRANSFORMATION',
  'editorial-life': 'EDITORIAL LIFE',
  'spatial-stage': 'SPATIAL STAGE',
  'practical-demo': 'PRACTICAL DEMO'
}

function visualPlanOf(shot: StoryboardShot): VisualPlanLike {
  const raw = (shot as StoryboardShot & { visualPlan?: unknown }).visualPlan
  if (!raw || typeof raw !== 'object') return {}
  const candidate = raw as {
    grammar?: unknown
    supportingGrammars?: unknown
    blendRationale?: unknown
    fusionReason?: unknown
    semanticReason?: unknown
    buildSteps?: unknown
  }
  const grammar = typeof candidate.grammar === 'string' && visualGrammarNames.has(candidate.grammar as VisualGrammarName)
    ? candidate.grammar as VisualGrammarName
    : undefined
  const supportingGrammars = Array.isArray(candidate.supportingGrammars)
    ? Array.from(new Set(candidate.supportingGrammars.filter((item): item is VisualGrammarName =>
        typeof item === 'string'
        && visualGrammarNames.has(item as VisualGrammarName)
        && item !== grammar
      ))).slice(0, 2)
    : undefined
  return {
    grammar,
    supportingGrammars,
    blendRationale: typeof candidate.blendRationale === 'string'
      ? candidate.blendRationale.trim()
      : typeof candidate.fusionReason === 'string'
        ? candidate.fusionReason.trim()
        : undefined,
    semanticReason: typeof candidate.semanticReason === 'string' ? candidate.semanticReason.trim() : undefined,
    buildSteps: Array.isArray(candidate.buildSteps)
      ? candidate.buildSteps.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined
  }
}

interface VisualTemplateContext {
  accent: string
  glow: string
  headline: string
  headlineLines: string[]
  supporting: string[]
  number: string
}

function textTspans(lines: string[], x: number, startY: number, lineHeight: number): string {
  return lines
    .map((line, lineIndex) => `<tspan x="${x}" y="${startY + lineIndex * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')
}

function supportOrFallback(lines: string[], fallback: string): string[] {
  return lines.length ? lines : displayLines(fallback, 14, 3)
}

function denseExplainerBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 78, 360, 104)
  const details = supportOrFallback(context.supporting, context.headline)
  const detailText = textTspans(details, 112, 1130, 64)
  return `<g>
    <rect x="74" y="142" width="330" height="42" rx="21" fill="${context.accent}"/>
    <text x="239" y="170" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="16" font-weight="800" letter-spacing="2">MODULAR EXPLAINER</text>
    <text x="1004" y="298" text-anchor="end" fill="#15171A" opacity="0.08" font-family="Arial, sans-serif" font-size="190" font-weight="900">${context.number}</text>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="84" font-weight="900" letter-spacing="-3">${title}</text>
    <rect x="76" y="550" width="928" height="4" fill="#15171A"/>
    <rect x="76" y="550" width="284" height="10" fill="${context.accent}"/>
    <g>
      <rect x="76" y="626" width="572" height="302" rx="28" fill="#FFFFFF" fill-opacity="0.84" stroke="#15171A" stroke-width="3"/>
      <text x="112" y="687" fill="${context.accent}" font-family="Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="4">CORE CLAIM</text>
      <text x="112" y="804" fill="#15171A" font-family="Arial, sans-serif" font-size="92" font-weight="900">01</text>
      <path d="M238 782H598" stroke="#15171A" stroke-width="3" stroke-dasharray="12 10" opacity="0.36"/>
      <circle cx="566" cy="860" r="28" fill="${context.accent}"/>
      <path d="M552 860h28m-14-14v28" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g>
      <rect x="672" y="626" width="332" height="142" rx="26" fill="${context.glow}" stroke="#15171A" stroke-width="3"/>
      <text x="704" y="680" fill="#15171A" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="3">EVIDENCE</text>
      <text x="704" y="738" fill="#15171A" font-family="Arial, sans-serif" font-size="42" font-weight="900">02 / WHY</text>
    </g>
    <g>
      <rect x="672" y="792" width="332" height="136" rx="26" fill="#15171A"/>
      <text x="704" y="846" fill="#FFFFFF" opacity="0.64" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="3">ACTION</text>
      <path d="M704 887H944" stroke="${context.accent}" stroke-width="12"/>
      <path d="M912 862l32 25-32 25" fill="none" stroke="${context.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <rect x="76" y="980" width="928" height="340" rx="30" fill="#FFFFFF" fill-opacity="0.66" stroke="#15171A" stroke-opacity="0.22" stroke-width="2"/>
    <text x="112" y="1044" fill="#15171A" opacity="0.48" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="4">CONTEXT / EXPLANATION</text>
    <text fill="#25282D" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="48" font-weight="700">${detailText}</text>
    <g transform="translate(76 1390)">
      <rect width="928" height="92" rx="46" fill="#15171A"/>
      <circle cx="52" cy="46" r="18" fill="${context.accent}"/>
      <text x="90" y="55" fill="#FFFFFF" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="25" font-weight="700">先看结论，再看证据，最后给动作</text>
      <text x="884" y="55" text-anchor="end" fill="#FFFFFF" opacity="0.5" font-family="Arial, sans-serif" font-size="18">01—02—03</text>
    </g>
  </g>`
}

function maskedTypographyBody(context: VisualTemplateContext): string {
  const repeated = escapeXml(context.headline.slice(0, 10) || '关键转折')
  const title = textTspans(context.headlineLines, 84, 724, 108)
  const details = supportOrFallback(context.supporting, context.headline).slice(0, 3)
  const chips = details.map((line, index) => {
    const y = 1154 + index * 104
    return `<g transform="translate(${84 + (index % 2) * 54} ${y})">
      <rect width="${Math.min(872, 210 + line.length * 42)}" height="76" rx="14" fill="${index === 1 ? context.accent : '#FFFFFF'}" stroke="#15171A" stroke-width="3"/>
      <text x="26" y="51" fill="${index === 1 ? '#FFFFFF' : '#15171A'}" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="34" font-weight="800">${escapeXml(line)}</text>
    </g>`
  }).join('')
  return `<g>
    <text x="72" y="176" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">MASK / TYPE / RHYTHM</text>
    <text x="1008" y="176" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">BEAT ${context.number}</text>
    <g opacity="0.16" fill="none" stroke="#15171A" stroke-width="3" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="126" font-weight="900">
      <text x="36" y="344">${repeated}</text>
      <text x="82" y="466">${repeated}</text>
      <text x="128" y="588">${repeated}</text>
    </g>
    <rect x="0" y="502" width="1080" height="350" fill="${context.accent}"/>
    <text fill="#FFFFFF" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="88" font-weight="900" letter-spacing="-3">${title}</text>
    <path d="M0 886H1080" stroke="#15171A" stroke-width="18"/>
    <path d="M0 912H730" stroke="${context.accent}" stroke-width="8"/>
    <g transform="translate(78 952)">
      ${Array.from({ length: Math.min(8, Math.max(4, repeated.length)) }, (_, index) => {
        const character = repeated[index] ?? '·'
        const active = index === 2 || index === 5
        return `<rect x="${index * 112}" width="88" height="88" rx="12" fill="${active ? '#15171A' : '#FFFFFF'}" stroke="#15171A" stroke-width="2"/><text x="${index * 112 + 44}" y="60" text-anchor="middle" fill="${active ? '#FFFFFF' : '#15171A'}" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="42" font-weight="900">${escapeXml(character)}</text>`
      }).join('')}
    </g>
    ${chips}
    <g transform="translate(76 1512)">
      <text x="0" y="32" fill="#15171A" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="4">DUPLICATE LAYERS</text>
      <path d="M0 66H928" stroke="#15171A" stroke-width="3" stroke-dasharray="8 9" opacity="0.42"/>
      <text x="0" y="128" fill="#15171A" opacity="0.62" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="26">重复字层 · 色块遮罩 · 单词逐拍进入</text>
    </g>
  </g>`
}

function motivatedMontageBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 78, 1370, 96)
  const details = supportOrFallback(context.supporting, context.headline)
  const detail = escapeXml(details[0] ?? context.headline)
  return `<g>
    <text x="74" y="178" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">MOTIVATED MONTAGE</text>
    <text x="1004" y="178" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">DIRECTION →</text>
    <g>
      <path d="M58 252H424L326 1120H58Z" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <circle cx="192" cy="486" r="118" fill="${context.glow}"/>
      <path d="M96 758L330 584L386 1120H58Z" fill="#15171A" opacity="0.1"/>
      <text x="92" y="318" fill="#15171A" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4">CAUSE / 01</text>
      <path d="M112 940L284 786" stroke="${context.accent}" stroke-width="14" stroke-linecap="round"/>
      <path d="M248 784l52-13-14 50" fill="none" stroke="${context.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <g>
      <path d="M440 252H790L692 1120H342Z" fill="${context.accent}" stroke="#15171A" stroke-width="3"/>
      <rect x="440" y="404" width="250" height="310" rx="125" fill="#FFFFFF" fill-opacity="0.88"/>
      <path d="M406 880L712 578" stroke="#FFFFFF" stroke-width="22" stroke-linecap="round"/>
      <text x="466" y="318" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4">TURN / 02</text>
      <text x="522" y="586" text-anchor="middle" fill="#15171A" font-family="Arial, sans-serif" font-size="74" font-weight="900">→</text>
    </g>
    <g>
      <path d="M806 252H1022V1120H708Z" fill="#15171A" stroke="#15171A" stroke-width="3"/>
      <circle cx="864" cy="484" r="92" fill="${context.glow}"/>
      <path d="M750 954L960 716" stroke="${context.accent}" stroke-width="14" stroke-linecap="round"/>
      <text x="842" y="318" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4">RESULT</text>
      <text x="852" y="1024" fill="#FFFFFF" opacity="0.66" font-family="Arial, sans-serif" font-size="18" font-weight="800">03</text>
    </g>
    <g transform="translate(58 1158)">
      <rect width="964" height="74" rx="37" fill="#FFFFFF" fill-opacity="0.78" stroke="#15171A" stroke-width="2"/>
      <circle cx="42" cy="37" r="14" fill="${context.accent}"/>
      <text x="76" y="47" fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="28" font-weight="700">${detail}</text>
    </g>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="78" font-weight="900" letter-spacing="-3">${title}</text>
    <path d="M76 1554H1004" stroke="#15171A" stroke-width="3"/>
    <path d="M76 1554H412" stroke="${context.accent}" stroke-width="12"/>
    <text x="76" y="1624" fill="#15171A" opacity="0.58" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="25">形状接形状 · 方向接方向 · 含义推动转场</text>
  </g>`
}

function photoTransformationBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 74, 290, 92)
  const details = supportOrFallback(context.supporting, context.headline)
  const detailText = textTspans(details.slice(0, 2), 104, 1482, 58)
  return `<g>
    <text x="74" y="154" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">PHOTO TRANSFORMATION</text>
    <text x="1006" y="154" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">BEFORE / AFTER</text>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="76" font-weight="900" letter-spacing="-3">${title}</text>
    <g transform="rotate(-3 274 810)">
      <rect x="58" y="456" width="432" height="710" rx="18" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <rect x="84" y="484" width="380" height="570" rx="10" fill="#DAD9D4"/>
      <circle cx="350" cy="650" r="82" fill="#BFC0BC"/>
      <path d="M84 940L218 770L310 856L396 716L464 796V1054H84Z" fill="#A9ABA8"/>
      <path d="M238 1010c0-124 40-220 92-220s92 96 92 220" fill="#777A78" opacity="0.62"/>
      <text x="94" y="1110" fill="#15171A" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="5">BEFORE</text>
      <text x="448" y="1110" text-anchor="end" fill="#15171A" opacity="0.44" font-family="Arial, sans-serif" font-size="18">01</text>
    </g>
    <g transform="rotate(3 806 744)">
      <rect x="578" y="386" width="438" height="724" rx="18" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <rect x="604" y="414" width="386" height="582" rx="10" fill="${context.glow}"/>
      <circle cx="868" cy="586" r="88" fill="#FFCC62"/>
      <path d="M604 866L744 680L834 768L916 616L990 706V996H604Z" fill="${context.accent}" opacity="0.74"/>
      <path d="M752 956c0-134 42-238 98-238s98 104 98 238" fill="#15171A" opacity="0.82"/>
      <path d="M778 744c36-34 106-34 142 0" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round"/>
      <text x="620" y="1050" fill="${context.accent}" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="5">AFTER</text>
      <text x="968" y="1050" text-anchor="end" fill="#15171A" opacity="0.44" font-family="Arial, sans-serif" font-size="18">02</text>
    </g>
    <g>
      <circle cx="540" cy="806" r="54" fill="#15171A"/>
      <path d="M510 806H570m-22-22 22 22-22 22" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M540 368V1204" stroke="#15171A" stroke-width="3" stroke-dasharray="10 12" opacity="0.34"/>
    </g>
    <rect x="74" y="1346" width="930" height="238" rx="28" fill="#FFFFFF" fill-opacity="0.78" stroke="#15171A" stroke-opacity="0.2" stroke-width="2"/>
    <text x="104" y="1408" fill="${context.accent}" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4">MATCH FRAME / MASK REVEAL</text>
    <text fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="40" font-weight="750">${detailText}</text>
  </g>`
}

function editorialLifeBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 74, 290, 94)
  const details = supportOrFallback(context.supporting, context.headline)
  const detailText = textTspans(details.slice(0, 3), 112, 1260, 62)
  return `<g>
    <text x="74" y="154" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">EDITORIAL LIFE NOTE</text>
    <text x="1006" y="154" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">MEMORY ${context.number}</text>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="78" font-weight="900" letter-spacing="-3">${title}</text>
    <g>
      <rect x="74" y="454" width="620" height="626" rx="22" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <rect x="98" y="478" width="572" height="518" rx="12" fill="${context.glow}"/>
      <circle cx="530" cy="632" r="92" fill="#FFC85A"/>
      <path d="M98 896L252 704L354 808L470 662L670 860V996H98Z" fill="${context.accent}" opacity="0.7"/>
      <path d="M238 960c8-126 64-224 130-218 66 7 100 114 76 234" fill="#15171A" opacity="0.8"/>
      <text x="110" y="1044" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="900" letter-spacing="4">DAY / 08:32</text>
      <text x="652" y="1044" text-anchor="end" fill="#15171A" opacity="0.42" font-family="Arial, sans-serif" font-size="17">FRAME A</text>
    </g>
    <g>
      <rect x="724" y="454" width="282" height="276" rx="18" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <rect x="744" y="474" width="242" height="196" rx="10" fill="#DCE8F4"/>
      <circle cx="914" cy="540" r="42" fill="${context.accent}" opacity="0.76"/>
      <path d="M744 650L818 566L868 616L922 554L986 626V670H744Z" fill="#15171A" opacity="0.42"/>
      <text x="744" y="704" fill="#15171A" font-family="Arial, sans-serif" font-size="16" font-weight="800">DETAIL 01</text>
      <rect x="724" y="760" width="282" height="320" rx="18" fill="#15171A"/>
      <text x="754" y="818" fill="#FFFFFF" opacity="0.54" font-family="Arial, sans-serif" font-size="16" font-weight="800" letter-spacing="3">INNER VOICE</text>
      <text x="754" y="910" fill="#FFFFFF" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="54" font-weight="900">“</text>
      <path d="M754 1006H952" stroke="${context.accent}" stroke-width="10"/>
    </g>
    <path d="M76 1142H1004" stroke="#15171A" stroke-width="3"/>
    <circle cx="106" cy="1142" r="13" fill="${context.accent}"/>
    <circle cx="438" cy="1142" r="8" fill="#15171A"/>
    <circle cx="772" cy="1142" r="8" fill="#15171A"/>
    <text fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="42" font-weight="720">${detailText}</text>
    <path d="M76 1494H1004" stroke="#15171A" stroke-opacity="0.3" stroke-width="2" stroke-dasharray="8 10"/>
    <text x="76" y="1552" fill="#15171A" opacity="0.56" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="24">环境建立 → 细节特写 → 内心一句 → 回到人物</text>
  </g>`
}

function spatialStageBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 74, 282, 92)
  const arcText = escapeXml((context.headline || '空间叙事').slice(0, 12))
  const details = supportOrFallback(context.supporting, context.headline).slice(0, 2)
  const detailText = textTspans(details, 104, 1448, 56)
  return `<g>
    <defs><path id="spatial-title-arc" d="M136 604Q540 332 944 604"/></defs>
    <text x="74" y="154" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">SPATIAL STORY STAGE</text>
    <text x="1006" y="154" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">DEPTH ${context.number}</text>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="76" font-weight="900" letter-spacing="-3">${title}</text>
    <g opacity="0.22" fill="none" stroke="#15171A" stroke-width="2">
      <path d="M540 520L42 1548M540 520L176 1548M540 520L310 1548M540 520L444 1548M540 520L636 1548M540 520L770 1548M540 520L904 1548M540 520L1038 1548"/>
      <path d="M432 744H648M364 890H716M292 1048H788M216 1218H864M134 1404H946"/>
    </g>
    <text fill="none" stroke="${context.accent}" stroke-width="2.5" opacity="0.56" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="58" font-weight="900" letter-spacing="5">
      <textPath href="#spatial-title-arc" startOffset="50%" text-anchor="middle">${arcText}</textPath>
    </text>
    <g>
      <rect x="72" y="536" width="612" height="742" rx="62" fill="#FFFFFF" fill-opacity="0.9" stroke="#15171A" stroke-width="4"/>
      <rect x="100" y="566" width="556" height="614" rx="40" fill="${context.glow}"/>
      <circle cx="378" cy="748" r="116" fill="#FFFFFF" fill-opacity="0.86" stroke="#15171A" stroke-opacity="0.12" stroke-width="3"/>
      <circle cx="378" cy="716" r="62" fill="${context.accent}" opacity="0.72"/>
      <path d="M234 1108c8-176 66-288 144-288s136 112 144 288" fill="#15171A" opacity="0.86"/>
      <rect x="122" y="1104" width="512" height="54" rx="27" fill="#FFFFFF" fill-opacity="0.82"/>
      <circle cx="158" cy="1131" r="10" fill="${context.accent}"/>
      <text x="184" y="1139" fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="21" font-weight="700">圆角口播主舞台 · 人物保持第一焦点</text>
      <text x="112" y="1234" fill="#15171A" opacity="0.48" font-family="Arial, sans-serif" font-size="17" font-weight="800" letter-spacing="4">TALKING FRAME / A</text>
    </g>
    <g transform="translate(718 590)">
      <rect x="36" y="0" width="270" height="188" rx="26" fill="#15171A" opacity="0.12"/>
      <rect x="18" y="22" width="270" height="188" rx="26" fill="${context.glow}" stroke="#15171A" stroke-width="3"/>
      <rect x="0" y="44" width="270" height="188" rx="26" fill="#FFFFFF" stroke="#15171A" stroke-width="3"/>
      <text x="26" y="92" fill="${context.accent}" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">MATERIAL 01</text>
      <rect x="26" y="116" width="218" height="12" rx="6" fill="#15171A" opacity="0.16"/>
      <rect x="26" y="146" width="158" height="12" rx="6" fill="#15171A" opacity="0.1"/>
      <circle cx="220" cy="188" r="22" fill="${context.accent}"/>
    </g>
    <g transform="translate(748 900)">
      <rect width="256" height="148" rx="24" fill="#FFFFFF" fill-opacity="0.86" stroke="#15171A" stroke-width="3"/>
      <text x="24" y="48" fill="#15171A" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">LAYER 02</text>
      <path d="M24 90H208" stroke="${context.accent}" stroke-width="10"/>
      <path d="M176 68l32 22-32 22" fill="none" stroke="${context.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <g transform="translate(716 1094)">
      <rect width="288" height="170" rx="26" fill="#15171A"/>
      <text x="26" y="52" fill="#FFFFFF" opacity="0.55" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">DEPTH CUE</text>
      <circle cx="62" cy="112" r="26" fill="${context.accent}"/>
      <circle cx="140" cy="112" r="18" fill="#FFFFFF" opacity="0.62"/>
      <circle cx="206" cy="112" r="11" fill="#FFFFFF" opacity="0.32"/>
    </g>
    <rect x="74" y="1356" width="930" height="226" rx="28" fill="#FFFFFF" fill-opacity="0.72" stroke="#15171A" stroke-opacity="0.18" stroke-width="2"/>
    <text x="104" y="1410" fill="${context.accent}" font-family="Arial, sans-serif" font-size="17" font-weight="900" letter-spacing="4">STAGE / LAYERS / ARC TYPE</text>
    <text fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="38" font-weight="730">${detailText}</text>
  </g>`
}

function practicalDemoBody(context: VisualTemplateContext): string {
  const title = textTspans(context.headlineLines, 74, 286, 92)
  const details = supportOrFallback(context.supporting, context.headline).slice(0, 2)
  const detailText = textTspans(details, 104, 1512, 52)
  return `<g>
    <text x="74" y="154" fill="#15171A" font-family="Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5">PRACTICAL DEMO</text>
    <text x="1006" y="154" text-anchor="end" fill="${context.accent}" font-family="Arial, sans-serif" font-size="19" font-weight="900">SHOW / PROVE</text>
    <text fill="#111317" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="76" font-weight="900" letter-spacing="-3">${title}</text>
    <g>
      <rect x="70" y="442" width="624" height="856" rx="62" fill="#15171A"/>
      <rect x="90" y="466" width="584" height="808" rx="44" fill="#FFFFFF"/>
      <rect x="276" y="482" width="212" height="26" rx="13" fill="#15171A"/>
      <rect x="118" y="544" width="528" height="76" rx="18" fill="${context.glow}"/>
      <circle cx="156" cy="582" r="12" fill="${context.accent}"/>
      <rect x="184" y="568" width="220" height="12" rx="6" fill="#15171A" opacity="0.7"/>
      <rect x="184" y="592" width="146" height="9" rx="4" fill="#15171A" opacity="0.2"/>
      <g transform="translate(118 660)">
        <rect width="528" height="242" rx="24" fill="#F4F0E8" stroke="#15171A" stroke-opacity="0.18" stroke-width="2"/>
        <text x="26" y="50" fill="#15171A" opacity="0.48" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">SCREEN / STEP 01</text>
        <rect x="26" y="78" width="476" height="22" rx="11" fill="#15171A" opacity="0.1"/>
        <rect x="26" y="124" width="332" height="22" rx="11" fill="${context.accent}" opacity="0.86"/>
        <rect x="26" y="170" width="416" height="22" rx="11" fill="#15171A" opacity="0.15"/>
        <circle cx="470" cy="190" r="26" fill="#15171A"/>
        <path d="M458 190h24m-12-12v24" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g transform="translate(118 934)">
        <rect width="528" height="274" rx="24" fill="${context.glow}" stroke="#15171A" stroke-opacity="0.18" stroke-width="2"/>
        <text x="26" y="50" fill="${context.accent}" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="3">RESULT / EVIDENCE</text>
        <path d="M44 220L152 154L244 180L352 88L472 120" fill="none" stroke="#15171A" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="352" cy="88" r="16" fill="${context.accent}"/>
        <path d="M44 230H484" stroke="#15171A" stroke-opacity="0.18" stroke-width="2"/>
      </g>
      <text x="382" y="1244" text-anchor="middle" fill="#15171A" opacity="0.42" font-family="Arial, sans-serif" font-size="16" font-weight="800" letter-spacing="3">GENERIC DEVICE / NO BRAND</text>
    </g>
    <g transform="translate(728 470)">
      ${['01', '02', '03'].map((step, index) => `<g transform="translate(0 ${index * 138})"><rect width="276" height="112" rx="24" fill="${index === 1 ? context.accent : '#FFFFFF'}" stroke="#15171A" stroke-width="3"/><text x="28" y="48" fill="${index === 1 ? '#FFFFFF' : '#15171A'}" font-family="Arial, sans-serif" font-size="18" font-weight="900">STEP ${step}</text><path d="M28 78H222" stroke="${index === 1 ? '#FFFFFF' : '#15171A'}" stroke-opacity="0.34" stroke-width="7"/></g>`).join('')}
    </g>
    <g transform="translate(730 918)">
      <rect width="274" height="380" rx="34" fill="#15171A"/>
      <text x="28" y="52" fill="#FFFFFF" opacity="0.52" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="3">PRESENTER</text>
      <circle cx="137" cy="152" r="64" fill="${context.glow}"/>
      <circle cx="137" cy="137" r="34" fill="${context.accent}" opacity="0.76"/>
      <path d="M72 250c4-78 30-126 65-126s61 48 65 126" fill="#FFFFFF" opacity="0.86"/>
      <rect x="30" y="286" width="214" height="58" rx="29" fill="${context.accent}"/>
      <text x="137" y="324" text-anchor="middle" fill="#FFFFFF" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="21" font-weight="800">讲解人物占位</text>
    </g>
    <rect x="74" y="1366" width="930" height="230" rx="28" fill="#FFFFFF" fill-opacity="0.76" stroke="#15171A" stroke-opacity="0.2" stroke-width="2"/>
    <text x="104" y="1420" fill="${context.accent}" font-family="Arial, sans-serif" font-size="17" font-weight="900" letter-spacing="4">BEFORE → OPERATION → EVIDENCE</text>
    <text fill="#15171A" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="36" font-weight="730">${detailText}</text>
  </g>`
}

function supportingGrammarOverlay(grammars: VisualGrammarName[], context: VisualTemplateContext): string {
  const codes: Record<VisualGrammarName, string> = {
    'dense-explainer': 'INFO',
    'masked-typography': 'TYPE',
    'motivated-montage': 'MOVE',
    'photo-transformation': 'PHOTO',
    'editorial-life': 'LIFE',
    'spatial-stage': 'SPACE',
    'practical-demo': 'DEMO'
  }
  return grammars.slice(0, 2).map((grammar, index) => {
    const icon = grammar === 'masked-typography'
      ? `<text x="14" y="25" fill="none" stroke="${context.accent}" stroke-width="1.5" font-family="Arial, sans-serif" font-size="22" font-weight="900">AA</text>`
      : grammar === 'motivated-montage'
        ? `<path d="M12 26L46 8m-9 1 10-1-2 10" fill="none" stroke="${context.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
        : grammar === 'photo-transformation'
          ? `<rect x="12" y="7" width="17" height="22" fill="#15171A" opacity="0.18"/><rect x="31" y="7" width="17" height="22" fill="${context.accent}" opacity="0.8"/>`
          : grammar === 'editorial-life'
            ? `<path d="M12 18H50" stroke="#15171A" stroke-width="2"/><circle cx="16" cy="18" r="4" fill="${context.accent}"/><circle cx="31" cy="18" r="3" fill="#15171A"/><circle cx="46" cy="18" r="3" fill="#15171A"/>`
            : grammar === 'spatial-stage'
              ? `<path d="M30 6L10 29m20-23 20 23M16 22h28M21 16h18" fill="none" stroke="${context.accent}" stroke-width="2"/>`
              : grammar === 'practical-demo'
                ? `<rect x="18" y="4" width="26" height="29" rx="6" fill="none" stroke="${context.accent}" stroke-width="2.5"/><path d="M24 13h14m-14 7h9" stroke="#15171A" stroke-width="2"/>`
                : `<rect x="12" y="7" width="16" height="10" rx="2" fill="${context.accent}"/><rect x="32" y="7" width="18" height="10" rx="2" fill="#15171A" opacity="0.22"/><rect x="12" y="21" width="38" height="8" rx="2" fill="#15171A" opacity="0.12"/>`
    return `<g transform="translate(${742 + index * 132} 82)">
      <rect width="120" height="46" rx="13" fill="#FFFFFF" fill-opacity="0.82" stroke="#15171A" stroke-opacity="0.22" stroke-width="2"/>
      ${icon}
      <text x="108" y="32" text-anchor="end" fill="#15171A" opacity="0.58" font-family="Arial, sans-serif" font-size="11" font-weight="900" letter-spacing="1">${codes[grammar]}</text>
    </g>`
  }).join('')
}

function createVisualSvg(project: Project, shot: StoryboardShot, index: number): string {
  const role = captionRole(project, shot)
  const palette = visualPalette(role, index)
  const plan = visualPlanOf(shot)
  const grammar = plan.grammar ?? 'dense-explainer'
  const headline = visualKeyword(shot.scriptText || shot.subtitle || '核心观点')
  const headlineLines = balancedHeadlineLines(headline)
  const supportingText = (shot.subtitle || shot.scriptText).trim()
  const supporting = supportingText.replace(/\s+/g, '') === headline.replace(/\s+/g, '')
    ? []
    : displayLines(supportingText, 16, 4)
  const projectName = escapeXml((project.name || '未命名创作').slice(0, 24))
  const number = String(index + 1).padStart(2, '0')
  const context: VisualTemplateContext = {
    accent: palette.accent,
    glow: palette.glow,
    headline,
    headlineLines,
    supporting,
    number
  }
  const body = grammar === 'spatial-stage'
    ? spatialStageBody(context)
    : grammar === 'practical-demo'
      ? practicalDemoBody(context)
      : grammar === 'masked-typography'
        ? maskedTypographyBody(context)
        : grammar === 'motivated-montage'
          ? motivatedMontageBody(context)
          : grammar === 'photo-transformation'
            ? photoTransformationBody(context)
            : grammar === 'editorial-life'
              ? editorialLifeBody(context)
              : denseExplainerBody(context)
  const supportingGrammars = plan.supportingGrammars ?? []
  const supportingOverlay = supportingGrammarOverlay(supportingGrammars, context)
  const supportingFooter = supportingGrammars.length
    ? ` + ${supportingGrammars.map((item) => visualGrammarLabels[item]).join(' + ')}`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <title>${escapeXml(`${visualGrammarLabels[grammar]} · ${plan.blendRationale || plan.semanticReason || headline}`)}</title>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FBF8F1"/><stop offset="0.58" stop-color="#F3EEE4"/><stop offset="1" stop-color="#ECE5D9"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.22" r="0.75">
      <stop offset="0" stop-color="${palette.glow}" stop-opacity="1"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#15171A" stroke-opacity="0.045" stroke-width="1"/></pattern>
  </defs>
  <rect width="1080" height="1920" fill="url(#background)"/>
  <rect width="1080" height="1920" fill="url(#glow)"/>
  <rect width="1080" height="1920" fill="url(#grid)"/>
  <rect x="0" y="0" width="1080" height="76" fill="#15171A"/>
  <text x="54" y="49" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4">HUITIAN / ORIGINAL FRAME</text>
  <text x="1026" y="49" text-anchor="end" fill="#FFFFFF" opacity="0.62" font-family="Arial, sans-serif" font-size="18" letter-spacing="3">9:16 · ORIGINAL</text>
  ${body}
  ${supportingOverlay}
  <g transform="translate(74 1690)">
    <rect width="930" height="104" rx="22" fill="#FFFFFF" fill-opacity="0.76" stroke="#15171A" stroke-opacity="0.18" stroke-width="2"/>
    <circle cx="42" cy="52" r="12" fill="${palette.accent}"/>
    <text x="72" y="47" fill="#15171A" opacity="0.76" font-family="Microsoft YaHei UI, Microsoft YaHei, sans-serif" font-size="23" font-weight="700">回天原创视觉 · ${projectName}</text>
    <text x="72" y="77" fill="#15171A" opacity="0.44" font-family="Arial, sans-serif" font-size="14" letter-spacing="1">${visualGrammarLabels[grammar]}${supportingFooter} / ${palette.label}</text>
    <text x="894" y="64" text-anchor="end" fill="#15171A" opacity="0.2" font-family="Arial, sans-serif" font-size="52" font-weight="900">${number}</text>
  </g>
  <path d="M0 1880H1080" stroke="#15171A" stroke-width="40"/>
  <path d="M0 1880H360" stroke="${palette.accent}" stroke-width="40"/>
</svg>`
}

async function renderSvgToImage(renderer: BrowserWindow, html: string, shotId: string): Promise<Electron.NativeImage> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await renderer.loadURL(`data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`)
      await renderer.webContents.executeJavaScript(`Promise.all([
        document.fonts.ready,
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))
      ]).then(() => true)`)
      const captured = await renderer.webContents.capturePage()
      if (!captured.isEmpty()) return captured
      lastError = new Error('捕获结果为空。')
    } catch (error) {
      lastError = error
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 60 * (attempt + 1)))
  }
  throw new Error(`原创画面 ${shotId} 渲染失败：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function existingAssetIds(project: Project): Promise<Set<string>> {
  const existing = new Set<string>()
  await Promise.all(project.assets.map(async (asset) => {
    try {
      await fs.access(asset.path)
      existing.add(asset.id)
    } catch {
      // A stale project path is not usable input; generation may safely replace it.
    }
  }))
  return existing
}

function hasUsableVisualAsset(
  project: Project,
  shot: StoryboardShot,
  existingAssets: Set<string>
): boolean {
  const attached = project.assets.find((asset) => asset.id === shot.assetId)
  if (!attached || !existingAssets.has(attached.id)) return false
  const extension = extname(attached.path).toLowerCase()
  return imageExtensions.has(extension) || videoExtensions.has(extension)
}

function generationPromptFor(project: Project, shot: StoryboardShot): string {
  const semanticPrompt = shot.visualPlan?.generationPrompt?.trim()
    || shot.visualDirection.trim()
    || shot.scriptText.trim()
  return `${semanticPrompt}

为“${project.name}”制作原创竖屏短视频辅助素材。浅色、清晰、高级、信息主体明确，构图为后续字幕预留安全区。只生成与这句话语义直接相关的环境、物品、抽象隐喻或过程画面；不要复制任何对标账号的具体镜头、人物或素材。不要生成可识别的真实人物、公众人物、版权角色、品牌标志、画内文案或仿制水印。画面本身不额外叠加“AI生成”字样，生成来源会保留在导出包的溯源清单中。`
}

function shotRequiresGeneratedMotion(shot: StoryboardShot): boolean {
  const direction = [
    shot.motion,
    shot.visualDirection,
    shot.visualPlan?.generationPrompt,
    shot.scriptText
  ].filter(Boolean).join(' ')
  if (/静态|定帧|不动|无动画/.test(direction)) return false
  return /动态|运动|动作|行走|奔跑|穿行|旋转|流动|变化|变形|推进|拉远|升降|环绕|摇镜|移镜|跟拍|延时|风吹|水流|车流|人群|粒子|烟雾|光影/.test(direction)
}

function shotsNeedingGeneratedVisuals(
  project: Project,
  existingAssets: Set<string>,
  baseVideo?: MediaAsset
): StoryboardShot[] {
  let cursor = 0
  return project.storyboard.filter((shot) => {
    const end = cursor + Math.max(0.8, shot.duration)
    cursor = end
    // An explicitly attached user asset always wins, including on an ai-visual shot.
    if (hasUsableVisualAsset(project, shot, existingAssets)) return false
    // A talking-head shot can keep using the uploaded base only while that file
    // still covers its timeline. Every other missing planned visual is a gap.
    if (shot.visualType !== 'talking-head') return true
    if (!baseVideo) return true
    if (!baseVideo.duration || baseVideo.duration <= 0) return false
    return end > baseVideo.duration + 0.05
  })
}

function isRemoteGenerationCandidate(shot: StoryboardShot): boolean {
  // Quote cards and missing evidence screenshots stay with the clearly editorial
  // local renderer. Remote generation is reserved for original B-roll/AI visuals,
  // plus the no-camera fallback when no talking-head base exists at all.
  return shot.visualType === 'ai-visual'
    || shot.visualType === 'b-roll'
    || shot.visualType === 'talking-head'
}

function generatedMediaManifestCsv(items: GeneratedVisual[]): string {
  const header = ['镜头ID', '文件', 'generated', 'provider', 'model', 'mediaType', 'prompt', 'provenance', 'apiJobId', 'fallbackReason', 'createdAt']
  const rows = items.map((item) => [
    item.shotId,
    basename(item.path),
    String(item.generated),
    item.provider,
    item.model,
    item.mediaType,
    item.prompt,
    item.provenance,
    item.apiJobId ?? '',
    item.fallbackReason ?? '',
    item.createdAt
  ].map(csvCell).join(','))
  return `\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`
}

async function writeGeneratedMediaManifest(
  target: string,
  items: GeneratedVisual[]
): Promise<string[]> {
  if (!items.length) return []
  const jsonPath = join(target, 'generated-media-manifest.json')
  const csvPath = join(target, 'generated-media-manifest.csv')
  await fs.writeFile(jsonPath, JSON.stringify({
    version: 1,
    videoEndpointNotice: 'Sora 2 / Videos API has announced shutdown on 2026-09-24; videoModel is configurable and must be replaced before production use after that date.',
    notice: '画面不强制叠加自有 AI 标签；生成来源、模型与提示词在此保留。第三方内容凭证不应被移除。',
    items: items.map((item) => ({ ...item, path: basename(item.path) }))
  }, null, 2), 'utf8')
  await fs.writeFile(csvPath, generatedMediaManifestCsv(items), 'utf8')
  return [jsonPath, csvPath]
}

async function createGeneratedVisuals(
  project: Project,
  target: string,
  aiSettings?: MediaGenerationSettings
): Promise<GeneratedVisual[]> {
  const existingAssets = await existingAssetIds(project)
  const baseVideo = project.assets.find((asset) => existingAssets.has(asset.id) && asset.kind === 'talking-head' && videoExtensions.has(extname(asset.path).toLowerCase()))
    ?? project.assets.find((asset) => existingAssets.has(asset.id) && ['video', 'screen-recording'].includes(asset.kind) && videoExtensions.has(extname(asset.path).toLowerCase()))
  const generatedShots = shotsNeedingGeneratedVisuals(project, existingAssets, baseVideo)
  if (!generatedShots.length) return []
  await fs.mkdir(target, { recursive: true })
  const output: GeneratedVisual[] = []
  const renderer = new BrowserWindow({
    show: false,
    width: 1080,
    height: 1920,
    useContentSize: true,
    backgroundColor: '#F3EEE4',
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      sandbox: true
    }
  })
  try {
    let remoteVideoAttempts = 0
    for (const shot of generatedShots) {
      const index = Math.max(0, project.storyboard.findIndex((item) => item.id === shot.id))
      const prompt = generationPromptFor(project, shot)
      let fallbackReason: string | undefined
      let failedApiJobId: string | undefined
      const remoteEligible = isRemoteGenerationCandidate(shot)
      if (remoteEligible && aiSettings && canGenerateMedia(aiSettings)) {
        try {
          const useVideo = aiSettings.preferVideoGeneration === true
            && shotRequiresGeneratedMotion(shot)
            && remoteVideoAttempts < 3
          if (useVideo) remoteVideoAttempts += 1
          const remote = await generateOpenAiMedia({
            prompt,
            outputDirectory: target,
            fileStem: String(index + 1).padStart(3, '0'),
            durationSeconds: shot.duration,
            jobStateDirectory: join(app.getPath('userData'), 'pending-media-jobs'),
            // Limit expensive video jobs per export; later gaps become generated
            // images and receive local camera motion during rough-cut rendering.
            requiresMotion: useVideo,
            settings: aiSettings
          })
          output.push({ shotId: shot.id, ...remote })
          continue
        } catch (error) {
          // Export must remain reliable when a provider refuses, times out, or is unavailable.
          fallbackReason = error instanceof Error ? error.message : String(error)
          const apiJobId = (error as { apiJobId?: unknown } | null)?.apiJobId
          if (typeof apiJobId === 'string' && apiJobId) failedApiJobId = apiJobId
        }
      }
      const svg = createVisualSvg(project, shot, index)
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#F3EEE4}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`
      const captured = await renderSvgToImage(renderer, html, shot.id)
      const image = captured.getSize().width === 1080 && captured.getSize().height === 1920
        ? captured
        : captured.resize({ width: 1080, height: 1920, quality: 'best' })
      const path = join(target, `${String(index + 1).padStart(3, '0')}_original-frame.png`)
      await fs.writeFile(path, image.toPNG())
      output.push({
        shotId: shot.id,
        path,
        generated: true,
        provider: '回天本地原创渲染器',
        model: 'huitian-svg-v1',
        prompt,
        provenance: fallbackReason ? 'local-original-fallback' : 'local-original-generated',
        mediaType: 'image',
        createdAt: new Date().toISOString(),
        apiJobId: failedApiJobId,
        fallbackReason
      })
    }
  } finally {
    if (!renderer.isDestroyed()) renderer.destroy()
  }
  return output
}

function shotListCsv(shots: StoryboardShot[], project: Project): string {
  const header = [
    '序号',
    '开始时间',
    '结束时间',
    '时长',
    '画面类型',
    '素材文件',
    '文案',
    '画面要求',
    '主语法',
    '辅助语法',
    '融合理由',
    '语义理由',
    '制作步骤',
    '动效',
    '转场'
  ]
  let cursor = 0
  const rows = shots.map((shot, index) => {
    const start = cursor
    cursor += shot.duration
    const asset = project.assets.find((item) => item.id === shot.assetId)
    const visualPlan = visualPlanOf(shot)
    return [
      index + 1,
      start.toFixed(2),
      cursor.toFixed(2),
      shot.duration.toFixed(2),
      shot.visualType,
      asset?.name ?? '',
      shot.scriptText,
      shot.visualDirection,
      visualPlan.grammar ?? '',
      visualPlan.supportingGrammars?.join(' + ') ?? '',
      visualPlan.blendRationale ?? '',
      visualPlan.semanticReason ?? '',
      visualPlan.buildSteps?.join(' → ') ?? '',
      shot.motion,
      shot.transition
    ].map(csvCell).join(',')
  })
  return `\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`
}

async function copyNumberedAssets(project: Project, target: string): Promise<string[]> {
  await fs.mkdir(target, { recursive: true })
  const copied: string[] = []
  let counter = 1
  for (const asset of project.assets.filter((item) => item.kind !== 'reference')) {
    try {
      const filename = `${String(counter).padStart(3, '0')}_${safeName(asset.name)}`
      const destination = join(target, filename)
      await fs.copyFile(asset.path, destination)
      copied.push(destination)
      counter += 1
    } catch {
      // Missing source files are reported by the caller through the copied list.
    }
  }
  return copied
}

function emitProgress(window: BrowserWindow | null, progress: RenderProgress): void {
  window?.webContents.send('render:progress', progress)
}

async function renderRoughCut(
  project: Project,
  target: string,
  window: BrowserWindow | null,
  generatedVisuals: GeneratedVisual[] = []
): Promise<string> {
  const existingAssets = await existingAssetIds(project)
  const base = project.assets.find((asset) => existingAssets.has(asset.id) && asset.kind === 'talking-head' && videoExtensions.has(extname(asset.path).toLowerCase()))
    ?? project.assets.find((asset) => existingAssets.has(asset.id) && ['video', 'screen-recording'].includes(asset.kind) && videoExtensions.has(extname(asset.path).toLowerCase()))
  const plannedDuration = project.storyboard.reduce((sum, shot) => sum + Math.max(0.8, shot.duration), 0)
  const requestedDuration = plannedDuration || project.durationTarget || 60
  // The storyboard is the delivery contract. A short source clip must not silently
  // delete later sentences; tpad below freezes its final frame until planned end.
  const duration = Math.max(2, requestedDuration)
  const overlays = project.storyboard
    .map((shot, index) => {
      const asset = project.assets.find((item) => item.id === shot.assetId)
      const generated = generatedVisuals.find((item) => item.shotId === shot.id)
      if (generated) return {
        shot,
        path: generated.path,
        type: generated.mediaType === 'video' ? 'generated-video' as const : 'generated-image' as const,
        index
      }
      if (!asset || !existingAssets.has(asset.id) || asset.path === base?.path) return undefined
      const extension = extname(asset.path).toLowerCase()
      if (imageExtensions.has(extension)) return { shot, path: asset.path, type: 'image' as const, index }
      if (videoExtensions.has(extension)) return { shot, path: asset.path, type: 'video' as const, index }
      return undefined
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const args: string[] = base
    ? ['-y', '-i', base.path]
    : ['-y', '-f', 'lavfi', '-i', `color=c=0x0B0D12:s=1080x1920:r=30:d=${duration}`]
  for (const overlay of overlays) {
    if (overlay.type === 'video' || overlay.type === 'generated-video') args.push('-stream_loop', '-1', '-i', overlay.path)
    else args.push('-loop', '1', '-i', overlay.path)
  }

  const baseFilter = base
    ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=contrast=1.035:saturation=1.04:brightness=0.012,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${duration.toFixed(2)}[base]`
    : '[0:v]setsar=1,fps=30[base]'
  const filters = [baseFilter]
  let current = 'base'
  overlays.forEach((item, overlayIndex) => {
    const shotIndex = project.storyboard.findIndex((shot) => shot.id === item.shot.id)
    const plannedStart = project.storyboard.slice(0, Math.max(0, shotIndex)).reduce((sum, shot) => sum + shot.duration, 0)
    const plannedEnd = plannedStart + item.shot.duration
    const start = item.shot.visualType === 'talking-head' && base?.duration
      ? Math.max(plannedStart, base.duration)
      : plannedStart
    const end = Math.min(duration, plannedEnd)
    const localDuration = Math.max(0.8, end - start)
    const prepared = `ov${overlayIndex}`
    const next = `v${overlayIndex}`
    if (item.type === 'generated-image') {
      filters.push(
        `[${overlayIndex + 1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `zoompan=z='min(max(zoom,pzoom)+0.00045,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,` +
        `format=rgba,fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${Math.max(0.15, localDuration - 0.12).toFixed(2)}:d=0.12:alpha=1,` +
        `setpts=PTS+${start.toFixed(2)}/TB[${prepared}]`
      )
    } else if (item.type === 'video' || item.type === 'generated-video') {
      filters.push(
        `[${overlayIndex + 1}:v]trim=duration=${localDuration.toFixed(2)},setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=contrast=1.025:saturation=1.04:brightness=0.008,` +
        `format=rgba,fade=t=in:st=0:d=0.16:alpha=1,fade=t=out:st=${Math.max(0.18, localDuration - 0.16).toFixed(2)}:d=0.16:alpha=1,` +
        `setpts=PTS+${start.toFixed(2)}/TB[${prepared}]`
      )
    } else {
      filters.push(
        `[${overlayIndex + 1}:v]scale=900:1200:force_original_aspect_ratio=decrease,` +
        `pad=900:1200:(ow-iw)/2:(oh-ih)/2:color=0xF3EEE4,` +
        `drawbox=x=0:y=0:w=iw:h=ih:color=0x15171A@0.24:t=4,` +
        `zoompan=z='min(max(zoom,pzoom)+0.00055,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=900x1200:fps=30,` +
        `format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${Math.max(0.22, localDuration - 0.18).toFixed(2)}:d=0.18:alpha=1,` +
        `setpts=PTS+${start.toFixed(2)}/TB[${prepared}]`
      )
    }
    filters.push(`[${current}][${prepared}]overlay=(W-w)/2:(H-h)/2:enable='between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})':eof_action=pass[${next}]`)
    current = next
  })

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${current}]`,
    '-map', '0:a?',
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    target
  )
  emitProgress(window, { projectId: project.id, phase: 'render', progress: 48, message: '正在本地生成竖屏粗剪…' })
  await run(ffmpegPath(), args)
  return target
}

async function renderCaptionedPreview(
  roughCut: string,
  captions: string,
  target: string,
  project: Project,
  window: BrowserWindow | null
): Promise<string> {
  emitProgress(window, { projectId: project.id, phase: 'render-preview', progress: 70, message: '正在生成带字幕预览…' })
  await run(ffmpegPath(), [
    '-y',
    '-i', roughCut,
    '-vf', 'ass=captions_styled.ass',
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    target
  ], dirname(captions))
  return target
}

async function zipDirectory(source: string, destination: string): Promise<void> {
  const output = (await import('node:fs')).createWriteStream(destination)
  const archive = new ZipArchive({ zlib: { level: 7 } })
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(source, false)
    void archive.finalize()
  })
}

async function confirmCloudMediaGeneration(
  project: Project,
  window: BrowserWindow | null,
  aiSettings?: MediaGenerationSettings
): Promise<{ settings?: MediaGenerationSettings; localOnly: boolean }> {
  if (!aiSettings || !canGenerateMedia(aiSettings)) {
    return { settings: aiSettings, localOnly: false }
  }
  const existingAssets = await existingAssetIds(project)
  const baseVideo = project.assets.find((asset) => existingAssets.has(asset.id) && asset.kind === 'talking-head' && videoExtensions.has(extname(asset.path).toLowerCase()))
    ?? project.assets.find((asset) => existingAssets.has(asset.id) && ['video', 'screen-recording'].includes(asset.kind) && videoExtensions.has(extname(asset.path).toLowerCase()))
  const remoteShots = shotsNeedingGeneratedVisuals(project, existingAssets, baseVideo)
    .filter(isRemoteGenerationCandidate)
  if (!remoteShots.length) return { settings: aiSettings, localOnly: false }

  // A background/headless export is never allowed to create paid jobs silently.
  if (!window || window.isDestroyed()) return { settings: undefined, localOnly: true }

  const videoCount = aiSettings.preferVideoGeneration
    ? Math.min(3, remoteShots.filter(shotRequiresGeneratedMotion).length)
    : 0
  const imageCount = remoteShots.length - videoCount
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    title: '确认本次联网素材生成',
    message: '这次导出会调用收费的联网素材服务。',
    detail: `预计生成 ${imageCount} 张图片${videoCount ? `、最多 ${videoCount} 个视频镜头` : ''}。重复导出会再次计费；实际费用由你连接的服务商收取。`,
    buttons: ['继续联网生成', '只用本地原创画面', '取消导出'],
    defaultId: 1,
    cancelId: 2,
    noLink: true
  })
  if (result.response === 2) throw new Error('已取消导出。')
  if (result.response === 1) return { settings: undefined, localOnly: true }
  return { settings: aiSettings, localOnly: false }
}

export async function exportProject(
  request: ExportRequest,
  window: BrowserWindow | null,
  aiSettings?: MediaGenerationSettings
): Promise<ExportResult> {
  const project = request.project
  let root = request.destination
  if (!root) {
    const result = await dialog.showOpenDialog({
      title: '选择导出位置',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) throw new Error('已取消导出。')
    root = result.filePaths[0]
  }
  const cloudGeneration = await confirmCloudMediaGeneration(project, window, aiSettings)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const directory = join(root, `${safeName(project.name)}_${stamp}`)
  await fs.mkdir(directory, { recursive: true })
  const files: string[] = []
  const warnings: string[] = []
  if (cloudGeneration.localOnly) {
    warnings.push('本次没有调用收费的联网素材服务，缺口镜头已改用本地原创画面。')
  }

  emitProgress(window, { projectId: project.id, phase: 'prepare', progress: 8, message: '正在整理文案与字幕…' })
  const activeScript = project.scriptVersions.find((item) => item.id === project.activeScriptId) ?? project.scriptVersions.at(-1)
  const scriptPath = join(directory, '文案.txt')
  await fs.writeFile(scriptPath, activeScript?.fullText ?? '', 'utf8')
  files.push(scriptPath)

  const srtPath = join(directory, 'captions.srt')
  await fs.writeFile(srtPath, createSrt(project.storyboard), 'utf8')
  files.push(srtPath)

  const styledCaptionPath = join(directory, 'captions_styled.ass')
  await fs.writeFile(styledCaptionPath, createStyledAss(project.storyboard, project), 'utf8')
  files.push(styledCaptionPath)

  const csvPath = join(directory, 'shotlist.csv')
  await fs.writeFile(csvPath, shotListCsv(project.storyboard, project), 'utf8')
  files.push(csvPath)

  const timelinePath = join(directory, 'timeline.json')
  await fs.writeFile(timelinePath, JSON.stringify({
    canvas: { width: 1080, height: 1920, fps: 30 },
    projectId: project.id,
    shots: project.storyboard
  }, null, 2), 'utf8')
  files.push(timelinePath)

  emitProgress(window, { projectId: project.id, phase: 'copy', progress: 25, message: '正在复制并编号素材…' })
  const copiedAssets = await copyNumberedAssets(project, join(directory, 'media'))
  files.push(...copiedAssets)
  const expectedAssets = project.assets.filter((item) => item.kind !== 'reference').length
  if (copiedAssets.length < expectedAssets) warnings.push('部分原素材已移动或无法读取，没有被复制到导出包。')

  emitProgress(window, { projectId: project.id, phase: 'generate-visuals', progress: 36, message: '正在生成原创信息视觉与转折画面…' })
  const generatedVisualDirectory = join(directory, 'generated-originals')
  const generatedVisuals = await createGeneratedVisuals(project, generatedVisualDirectory, cloudGeneration.settings)
  files.push(...generatedVisuals.map((item) => item.path))
  const generatedManifestFiles = await writeGeneratedMediaManifest(generatedVisualDirectory, generatedVisuals)
  files.push(...generatedManifestFiles)
  const cloudFallbackCount = generatedVisuals.filter((item) => item.provenance === 'local-original-fallback').length
  if (cloudFallbackCount > 0) {
    warnings.push(`${cloudFallbackCount} 个云端素材未能生成，已自动换成本地原创画面；详情保存在生成素材溯源清单中。`)
  }

  const readmePath = join(directory, '剪映导入说明.txt')
  const readme = `回天创作台｜剪映友好素材包

1. 在剪映中新建 1080×1920、30fps 项目。
2. 将 media 文件夹中的素材按 001、002…顺序批量导入。
3. 导入 captions.srt，字幕会成为可单独修改的文本块。
4. 参考 shotlist.csv 调整镜头起止时间、动效与转场。
5. timeline.json 是本软件的时间线备份，不是剪映原生草稿。
6. captions_styled.ass 是成片预览使用的动态字幕样式备份。
7. generated-originals 文件夹（如有）包含软件补齐的原创图片、视频或本地编辑视觉卡，可继续叠字、调色或替换。
8. generated-media-manifest.json / .csv 保存 generated、provider、model、prompt 与 provenance，便于平台披露和素材追溯；这些信息不会以大字压在画面上，也不会移除服务商强制的内容凭证。
9. 当前默认 Sora 2 视频端点已公告将在 2026-09-24 停止服务；videoModel 是可替换设置，正式发布前需换成届时可用的视频模型。

说明：
- “自动创建剪映草稿”目前属于后续兼容功能，本导出包采用稳定、可人工调整的方式交付。
- 对标只应用抽象结构与视觉规律，请确保上传素材、音乐、人物肖像和截图拥有使用权。
`
  await fs.writeFile(readmePath, readme, 'utf8')
  files.push(readmePath)

  if (request.includeCleanRoughCut !== false || request.includePreview !== false) {
    try {
      const existingAssets = await existingAssetIds(project)
      const base = project.assets.find((asset) => existingAssets.has(asset.id) && asset.kind === 'talking-head' && videoExtensions.has(extname(asset.path).toLowerCase()))
        ?? project.assets.find((asset) => existingAssets.has(asset.id) && ['video', 'screen-recording'].includes(asset.kind) && videoExtensions.has(extname(asset.path).toLowerCase()))
      const plannedDuration = project.storyboard.reduce((sum, shot) => sum + Math.max(0.8, shot.duration), 0)
      if (base?.duration && base.duration + 0.25 < plannedDuration) {
        warnings.push('口播/底片短于完整分镜，已保留全部文案时长，并用缺口画面与末帧承接尾部。')
      }
      const roughPath = join(directory, 'clean_roughcut.mp4')
      await renderRoughCut(project, roughPath, window, generatedVisuals)
      if (request.includeCleanRoughCut !== false) {
        files.push(roughPath)
      }
      if (request.includePreview !== false) {
        const previewPath = join(directory, 'final_preview.mp4')
        await renderCaptionedPreview(roughPath, srtPath, previewPath, project, window)
        files.push(previewPath)
      }
      if (request.includeCleanRoughCut === false) {
        await fs.rm(roughPath, { force: true })
      }
      if (!project.assets.some((asset) => videoExtensions.has(extname(asset.path).toLowerCase()))) {
        warnings.push('没有口播或视频素材，已生成无声的字幕画面预览；上传真人口播后可得到更完整的粗剪。')
      }
    } catch (error) {
      warnings.push(`粗剪渲染失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  emitProgress(window, { projectId: project.id, phase: 'package', progress: 86, message: '正在生成便于传输的压缩包…' })
  try {
    const zipPath = `${directory}.zip`
    await zipDirectory(directory, zipPath)
    files.push(zipPath)
  } catch (error) {
    warnings.push(`压缩包生成失败：${error instanceof Error ? error.message : String(error)}`)
  }

  const result: ExportResult = {
    directory,
    files,
    warnings,
    createdAt: new Date().toISOString()
  }
  emitProgress(window, { projectId: project.id, phase: 'done', progress: 100, message: '导出完成，可以进入剪映精修。' })
  return result
}

export async function reveal(path: string): Promise<void> {
  await shell.openPath(path)
}

export async function chooseExportDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择默认导出目录',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0] ?? null
}
