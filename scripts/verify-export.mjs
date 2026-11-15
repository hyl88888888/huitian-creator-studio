import { spawn } from 'node:child_process'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

function run(binary, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolveRun(stdout)
      else reject(new Error(stderr.slice(-2000) || `进程退出码：${code}`))
    })
  })
}

if (!ffmpegStatic) throw new Error('ffmpeg-static 没有提供可执行文件。')

const fixtureDirectory = resolve('artifacts', 'export-fixtures')
const exportRoot = resolve('artifacts', `export-result-${Date.now()}`)
const talkingHead = resolve(fixtureDirectory, 'talking-head.mp4')
const screenshot = resolve(fixtureDirectory, 'supporting-shot.png')
await mkdir(fixtureDirectory, { recursive: true })
await mkdir(exportRoot, { recursive: true })

await run(ffmpegStatic, [
  '-y',
  '-f', 'lavfi',
  '-i', 'color=c=0x27314a:s=720x1280:r=30:d=4',
  '-f', 'lavfi',
  '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
  '-shortest',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  talkingHead
])
await run(ffmpegStatic, [
  '-y',
  '-f', 'lavfi',
  '-i', 'color=c=0xff7a1a:s=720x960',
  '-frames:v', '1',
  screenshot
])

let application

try {
  application = await electron.launch(
    process.env.HUITIAN_EXECUTABLE
      ? { executablePath: process.env.HUITIAN_EXECUTABLE }
      : { args: ['.'] }
  )
  const page = await application.firstWindow()
  await page.waitForFunction(() => Boolean(window.studio), undefined, { timeout: 15_000 })

  const { result, fallbackResult } = await page.evaluate(async ({ exportRoot, talkingHead, screenshot }) => {
    const now = new Date().toISOString()
    const firstSentenceId = crypto.randomUUID()
    const secondSentenceId = crypto.randomUUID()
    const thirdSentenceId = crypto.randomUUID()
    const project = {
      id: crypto.randomUUID(),
      name: '导出集成验证',
      mode: 'personal-ip',
      step: 'export',
      platform: 'douyin',
      goal: 'trust',
      durationTarget: 8,
      aspectRatio: '9:16',
      assetPolicy: 'owned-first',
      topic: '验证本地粗剪、字幕和素材包',
      audience: '新媒体创作者',
      coreViewpoint: '稳定交付比堆叠特效重要',
      realExperience: '',
      desiredFeeling: '放心',
      requirements: '画面清晰，字幕可编辑',
      productName: '',
      productFacts: '',
      productOffer: '',
      cta: '',
      references: [],
      assets: [
        {
          id: 'talking',
          name: 'talking-head.mp4',
          path: talkingHead,
          uri: '',
          kind: 'talking-head',
          mimeType: 'video/mp4',
          size: 1,
          duration: 4,
          width: 720,
          height: 1280,
          status: 'ready'
        },
        {
          id: 'supporting',
          name: 'supporting-shot.png',
          path: screenshot,
          uri: '',
          kind: 'screenshot',
          mimeType: 'image/png',
          size: 1,
          width: 720,
          height: 960,
          status: 'ready'
        }
      ],
      scriptVersions: [{
        id: 'script',
        title: '验证文案',
        fullText: '先把真实表达说清楚。\n再让画面帮助观众理解。\n缺少的过程镜头由原创画面补齐。',
        sentences: [
          {
            id: firstSentenceId,
            text: '先把真实表达说清楚。',
            role: 'situation',
            estimatedSeconds: 3,
            status: 'pass',
            check: {
              relatable: true,
              humanDriver: '处境关联',
              advances: true,
              creatorCentric: false,
              reason: '通过',
              score: 90
            }
          },
          {
            id: secondSentenceId,
            text: '再让画面帮助观众理解。',
            role: 'benefit',
            estimatedSeconds: 3,
            status: 'pass',
            check: {
              relatable: true,
              humanDriver: '获得感',
              advances: true,
              creatorCentric: false,
              reason: '通过',
              score: 92
            }
          },
          {
            id: thirdSentenceId,
            text: '缺少的过程镜头由原创画面补齐。',
            role: 'evidence',
            estimatedSeconds: 2,
            status: 'pass',
            check: {
              relatable: true,
              humanDriver: '过程证据',
              advances: true,
              creatorCentric: false,
              reason: '通过',
              score: 91
            }
          }
        ],
        estimatedSeconds: 8,
        complianceScore: 91,
        createdAt: now
      }],
      activeScriptId: 'script',
      storyboard: [
        {
          id: 'shot-1',
          order: 0,
          sentenceIds: [firstSentenceId],
          scriptText: '先把真实表达说清楚。',
          duration: 3,
          visualType: 'talking-head',
          visualDirection: '真人口播',
          assetId: 'talking',
          subtitle: '先把真实表达说清楚。',
          motion: '轻微推拉',
          transition: '无',
          locked: false
        },
        {
          id: 'shot-2',
          order: 1,
          sentenceIds: [secondSentenceId],
          scriptText: '再让画面帮助观众理解。',
          duration: 3,
          visualType: 'screenshot',
          visualDirection: '截图居中',
          assetId: 'supporting',
          subtitle: '再让画面帮助观众理解。',
          motion: '截图推近 + 重点框选',
          transition: '快速叠化',
          locked: false
        },
        {
          id: 'shot-3',
          order: 2,
          sentenceIds: [thirdSentenceId],
          scriptText: '缺少的过程镜头由原创画面补齐。',
          duration: 2,
          visualType: 'talking-head',
          visualDirection: '口播底片结束后用原创过程细节画面承接',
          assetId: undefined,
          subtitle: '缺少的过程镜头由原创画面补齐。',
          motion: '缓慢推进',
          transition: '动作匹配切换',
          locked: false
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    const result = await window.studio.exportProject({
      project,
      destination: exportRoot,
      includePreview: true,
      includeCleanRoughCut: true
    })
    const visualGrammarFixtures = [
      { grammar: 'dense-explainer', text: '三个数据说明，真正的原因不在表面。', supporting: ['spatial-stage'], influences: ['GenJi', 'Z嗯'] },
      { grammar: 'masked-typography', text: '你以为是在努力，其实是在自我消耗。', supporting: ['editorial-life'], influences: ['路过我的生活', '回天'] },
      { grammar: 'motivated-montage', text: '从反复解释，到用结果让人相信。', supporting: ['masked-typography'], influences: ['南门录像厅', '路过我的生活'] },
      { grammar: 'photo-transformation', text: '同一张原图，三步变成更有质感的成片。', supporting: ['practical-demo'], influences: ['小小小小fish', '回天'] },
      { grammar: 'editorial-life', text: '下班回到家，你又把想说的话咽了回去。', supporting: ['spatial-stage'], influences: ['回天', 'Z嗯'] },
      { grammar: 'spatial-stage', text: '一开口就让观众看见，这件事和他有什么关系。', supporting: ['masked-typography', 'dense-explainer'], influences: ['Z嗯', '路过我的生活', 'GenJi'] },
      { grammar: 'practical-demo', text: '把手机放到桌边，跟着三步实拍验证效果。', supporting: ['dense-explainer', 'spatial-stage'], influences: ['小小小小fish', 'GenJi', 'Z嗯'] }
    ]
    const fixtureSentence = project.scriptVersions[0].sentences[0]
    const generatedSentences = visualGrammarFixtures.map((fixture, index) => ({
      ...fixtureSentence,
      id: `generated-sentence-${index + 1}`,
      text: fixture.text,
      role: index === 2 ? 'turn' : index === 0 ? 'evidence' : index === 1 ? 'emotion' : 'situation',
      estimatedSeconds: 1.2
    }))
    const generatedScript = {
      ...project.scriptVersions[0],
      id: 'generated-visual-script',
      fullText: generatedSentences.map((sentence) => sentence.text).join('\n'),
      sentences: generatedSentences,
      estimatedSeconds: 8.4
    }
    const noAssetProject = {
      ...project,
      id: crypto.randomUUID(),
      name: '七类融合画面验证',
      durationTarget: 8.4,
      assets: [],
      scriptVersions: [generatedScript],
      activeScriptId: generatedScript.id,
      storyboard: visualGrammarFixtures.map((fixture, index) => ({
        id: `generated-shot-${index + 1}`,
        order: index,
        sentenceIds: [generatedSentences[index].id],
        scriptText: fixture.text,
        duration: 1.2,
        visualType: 'quote-card',
        visualDirection: '按语义生成回天浅色原创编辑画面',
        assetId: undefined,
        subtitle: fixture.text,
        motion: '轻微推近',
        transition: index === 0 ? '无' : '直接切换',
        locked: false,
        visualPlan: {
          grammar: fixture.grammar,
          supportingGrammars: fixture.supporting,
          influences: fixture.influences,
          blendRationale: `以 ${fixture.grammar} 承担主要表达，辅助方法只补充证据、空间或重音。`,
          confidence: fixture.grammar === 'motivated-montage' ? 'provisional' : 'verified',
          semanticReason: `这句话的表达任务与 ${fixture.grammar} 的主要职责一致。`,
          buildSteps: ['建立唯一主焦点', '按语义加入必要辅助层', '统一浅色品牌并预留字幕安全区'],
          generationPrompt: `围绕“${fixture.text}”制作原创画面，不复刻对标作品。`
        }
      }))
    }
    const fallbackResult = await window.studio.exportProject({
      project: noAssetProject,
      destination: exportRoot,
      includePreview: true,
      includeCleanRoughCut: true
    })
    return { result, fallbackResult }
  }, { exportRoot, talkingHead, screenshot })

  const unexpectedWarnings = result.warnings.filter((warning) => !warning.includes('短于完整分镜'))
  if (unexpectedWarnings.length) {
    throw new Error(`导出警告：${unexpectedWarnings.join(' | ')}`)
  }
  if (!result.warnings.some((warning) => warning.includes('短于完整分镜'))) {
    throw new Error('短口播没有给出完整时长承接提示。')
  }

  const requiredFiles = [
    '文案.txt',
    'captions.srt',
    'captions_styled.ass',
    'shotlist.csv',
    'timeline.json',
    '剪映导入说明.txt',
    'clean_roughcut.mp4',
    'final_preview.mp4'
  ]
  await Promise.all(requiredFiles.map((name) => access(resolve(result.directory, name))))
  await access(`${result.directory}.zip`)
  await access(resolve(result.directory, 'generated-originals', '003_original-frame.png'))
  await access(resolve(result.directory, 'generated-originals', 'generated-media-manifest.json'))
  await access(resolve(fallbackResult.directory, 'clean_roughcut.mp4'))
  await access(resolve(fallbackResult.directory, 'final_preview.mp4'))
  const generatedFrames = Array.from({ length: 7 }, (_, index) => resolve(
    fallbackResult.directory,
    'generated-originals',
    `${String(index + 1).padStart(3, '0')}_original-frame.png`
  ))
  await Promise.all(generatedFrames.map((path) => access(path)))
  const generatedManifestPath = resolve(fallbackResult.directory, 'generated-originals', 'generated-media-manifest.json')
  await access(generatedManifestPath)
  await access(resolve(fallbackResult.directory, 'generated-originals', 'generated-media-manifest.csv'))
  const generatedManifest = JSON.parse(await readFile(generatedManifestPath, 'utf8'))
  if (generatedManifest.items?.length !== 7) {
    throw new Error(`生成素材溯源条目异常：${generatedManifest.items?.length ?? 0}`)
  }
  if (!generatedManifest.items.every((item) => item.generated === true && item.provenance === 'local-original-generated')) {
    throw new Error('生成素材溯源字段不完整。')
  }
  if (JSON.stringify(generatedManifest).toLowerCase().includes('test-secret-key')) {
    throw new Error('生成素材溯源清单意外包含访问密钥。')
  }
  if (!fallbackResult.warnings.some((warning) => warning.includes('无声'))) {
    throw new Error('无素材导出没有给出明确的无声预览提示。')
  }
  const generatedShotList = await readFile(resolve(fallbackResult.directory, 'shotlist.csv'), 'utf8')
  for (const requiredText of ['主语法', '辅助语法', '融合理由', 'spatial-stage', 'practical-demo']) {
    if (!generatedShotList.includes(requiredText)) throw new Error(`分镜表缺少融合导演信息：${requiredText}`)
  }

  const probeRaw = await run(ffprobeStatic.path, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    resolve(result.directory, 'clean_roughcut.mp4')
  ])
  const probe = JSON.parse(probeRaw)
  const video = probe.streams.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
  if (video?.width !== 1080 || video?.height !== 1920) {
    throw new Error(`粗剪尺寸异常：${video?.width}×${video?.height}`)
  }
  if (!audio) throw new Error('粗剪没有保留口播音轨。')
  if (Number(probe.format.duration) < 7.9) throw new Error(`短口播仍截断了完整分镜：${probe.format.duration} 秒`)
  const tailStats = await run(ffmpegStatic, [
    '-ss', '7',
    '-i', resolve(result.directory, 'clean_roughcut.mp4'),
    '-frames:v', '1',
    '-vf', 'signalstats,metadata=print:file=-',
    '-f', 'null',
    '-'
  ])
  const tailLuminance = Number(tailStats.match(/lavfi\.signalstats\.YAVG=([\d.]+)/)?.[1] ?? 0)
  if (tailLuminance < 100) {
    throw new Error(`短口播尾部仍停留在深色底片，没有进入补画：YAVG=${tailLuminance}`)
  }

  const captions = await readFile(resolve(result.directory, 'captions.srt'), 'utf8')
  if (!captions.includes('00:00:03,000 --> 00:00:06,000')) {
    throw new Error('SRT 时间码与分镜不一致。')
  }
  const zipInfo = await stat(`${result.directory}.zip`)

  console.log(JSON.stringify({
    ok: true,
    directory: result.directory,
    files: result.files.length,
    dimensions: `${video.width}x${video.height}`,
    duration: Number(probe.format.duration),
    tailGapVisualLuminance: tailLuminance,
    audio: audio.codec_name,
    zipBytes: zipInfo.size,
    noAssetFallback: true,
    originalVisuals: 7,
    provenanceManifest: true,
    generatedFrames,
    styledCaptions: true
  }))
} finally {
  if (application) await application.close()
}
