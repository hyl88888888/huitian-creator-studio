import { describe, expect, it, vi } from 'vitest'
import type { Project } from '../shared/types'
import { runAiTask } from './ai'
import {
  fallbackBlueprint,
  fallbackScript,
  fallbackStoryboard,
  fallbackUnderstanding
} from './fallback-engine'

function project(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString()
  return {
    id: 'project',
    name: '个人IP测试',
    mode: 'personal-ip',
    step: 'setup',
    platform: 'douyin',
    goal: 'trust',
    durationTarget: 60,
    aspectRatio: '9:16',
    assetPolicy: 'owned-first',
    topic: '普通人如何开始做个人IP',
    audience: '有经验却不敢表达的职场人',
    coreViewpoint: '经历只有和观众的处境发生关系，才会成为内容',
    realExperience: '我曾经只讲自己多专业，观众却不断划走',
    desiredFeeling: '被说中并愿意行动',
    requirements: '从人性的角度出发，每一句让观众联想到自己，不能让人产生“关我屁事”的想法。',
    productName: '',
    productFacts: '',
    productOffer: '',
    cta: '',
    references: [],
    assets: [],
    scriptVersions: [],
    storyboard: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('本地创作引擎', () => {
  it('把抽象的观众关联要求拆成可执行规则', () => {
    const result = fallbackUnderstanding(project())
    const enabledRules = result.rules.filter((rule) => rule.enabled).map((rule) => rule.text).join('\n')

    expect(result.summary).toContain('观众')
    expect(enabledRules).toContain('这会怎样影响观众')
    expect(enabledRules).toContain('抽象结论后必须跟具体场景')
    expect(enabledRules).toContain('关我何事')
  })

  it('先形成观众张力，再生成带逐句检查的文案', () => {
    const input = project()
    const blueprint = fallbackBlueprint(input)
    const script = fallbackScript({ ...input, blueprint })

    expect(blueprint.sections).toHaveLength(5)
    expect(blueprint.sections.every((section) => section.audienceLink.length > 0)).toBe(true)
    expect(script.sentences.length).toBeGreaterThanOrEqual(6)
    expect(script.sentences.every((sentence) => sentence.check.reason.length > 0)).toBe(true)
    expect(script.complianceScore).toBeGreaterThanOrEqual(70)
    expect(script.fullText).toContain('你')
  })

  it('能从极简入口的整段话中分离主题和写作要求', () => {
    const quickPrompt = '我想做一条个人IP口播，讲“普通人不是没有内容，而是总觉得自己的经历不值得讲”。要从人性出发，每句话都和观众有关。开头要有冲突，不能说空话。'
    const input = project({ topic: quickPrompt, requirements: '', coreViewpoint: '' })
    const understanding = fallbackUnderstanding(input)
    const script = fallbackScript(input)
    const rules = understanding.rules.map((rule) => rule.text).join('\n')

    expect(understanding.summary).toContain('普通人不是没有内容')
    expect(rules).toContain('每句话都和观众有关')
    expect(rules).toContain('不能说空话')
    expect(script.title).toContain('普通人不是没有内容')
    expect(script.fullText).not.toContain('我想做一条个人IP口播')
    expect(script.fullText).not.toContain('开头要有冲突')
  })

  it('优先把用户截图匹配给适合的语义镜头', () => {
    const input = project({
      assets: [{
        id: 'screenshot',
        name: '数据截图.png',
        path: 'D:\\素材\\数据截图.png',
        uri: 'local-media://test',
        kind: 'screenshot',
        mimeType: 'image/png',
        size: 1024,
        status: 'ready'
      }]
    })
    const script = fallbackScript(input)
    const storyboard = fallbackStoryboard({
      ...input,
      scriptVersions: [script],
      activeScriptId: script.id
    })

    expect(storyboard).toHaveLength(script.sentences.length)
    expect(storyboard.some((shot) => shot.assetId === 'screenshot' && shot.visualType === 'screenshot')).toBe(true)
    expect(storyboard.every((shot, index) => shot.order === index)).toBe(true)
  })

  it('有口播但缺少辅助素材时，会为需要举证或演示的句子安排原创补画', () => {
    const talkingHead = {
      id: 'talking-head',
      name: '我的口播.mp4',
      path: 'D:\\素材\\我的口播.mp4',
      uri: 'local-media://talking-head',
      kind: 'talking-head' as const,
      mimeType: 'video/mp4',
      size: 1024,
      status: 'ready' as const
    }
    const input = project({ assets: [talkingHead], assetPolicy: 'owned-first' })
    const base = fallbackScript(input)
    const template = base.sentences[0]
    const sentences = [
      { ...template, id: 'person', role: 'situation' as const, text: '你第一次面对镜头时，先把这句话说给一个具体的人。' },
      { ...template, id: 'proof', role: 'evidence' as const, text: '三个数据证明，真正的原因不在表面。' },
      { ...template, id: 'demo', role: 'benefit' as const, text: '把手机放到桌边，跟着三步实拍验证效果。' }
    ]
    const script = { ...base, id: 'missing-assets', sentences, fullText: sentences.map((sentence) => sentence.text).join('\n') }
    const storyboard = fallbackStoryboard({ ...input, scriptVersions: [script], activeScriptId: script.id })

    expect(storyboard[0].visualType).toBe('talking-head')
    expect(storyboard[1].visualType).toBe('ai-visual')
    expect(storyboard[2].visualType).toBe('ai-visual')
    expect(storyboard.slice(1).every((shot) => shot.assetId === undefined)).toBe(true)
  })

  it('按文案语义选择独特但原创的画面语法', () => {
    const input = project()
    const base = fallbackScript(input)
    const template = base.sentences[0]
    const sentences = [
      { ...template, id: 'spatial', role: 'situation' as const, text: '如果你一开口观众就想划走，先看清这个观点。' },
      { ...template, id: 'practical', role: 'benefit' as const, text: '把手机放到桌边，跟着这三步实拍就能完成。' },
      { ...template, id: 'dense', role: 'evidence' as const, text: '这组数据证明，真正的原理和差别都在这里。' },
      { ...template, id: 'masked', role: 'emotion' as const, text: '越想证明自己，越容易被忽略。' },
      { ...template, id: 'montage', role: 'turn' as const, text: '但真正的转折，是从解释自己到帮助别人。' },
      { ...template, id: 'photo', role: 'story' as const, text: '同一张照片经过修图，从原图变成成片效果。' },
      { ...template, id: 'life', role: 'situation' as const, text: '下班回到家，你又把想说的话咽了回去。' }
    ]
    const script = {
      ...base,
      id: 'visual-script',
      sentences,
      fullText: sentences.map((sentence) => sentence.text).join('\n')
    }
    const storyboard = fallbackStoryboard({
      ...input,
      scriptVersions: [script],
      activeScriptId: script.id
    })
    const plans = Object.fromEntries(storyboard.map((shot) => [shot.sentenceIds[0], shot.visualPlan]))

    expect(plans.spatial?.grammar).toBe('spatial-stage')
    expect(plans.spatial?.influences.join('')).toContain('Z嗯')
    expect(plans.practical?.grammar).toBe('practical-demo')
    expect(plans.practical?.influences.join('')).toContain('小小小小fish')
    expect(plans.practical?.supportingGrammars).toEqual(['dense-explainer', 'spatial-stage'])
    expect(plans.dense?.grammar).toBe('dense-explainer')
    expect(plans.dense?.influences.join('')).toContain('GenJi')
    expect(plans.masked?.grammar).toBe('masked-typography')
    expect(plans.masked?.influences.join('')).toContain('路过我的生活')
    expect(plans.montage?.grammar).toBe('motivated-montage')
    expect(plans.montage?.influences.join('')).toContain('南门录像厅')
    expect(plans.montage?.confidence).toBe('provisional')
    expect(plans.photo?.grammar).toBe('photo-transformation')
    expect(plans.photo?.influences.join('')).toContain('小小小小fish')
    expect(plans.photo?.confidence).toBe('verified')
    expect(plans.life?.grammar).toBe('editorial-life')
    expect(plans.life?.confidence).toBe('generic')
    expect(storyboard.every((shot) => shot.visualPlan?.referenceAccount === undefined)).toBe(true)
    expect(storyboard.every((shot) => (shot.visualPlan?.supportingGrammars.length ?? 3) <= 2)).toBe(true)
    expect(storyboard.some((shot) => (shot.visualPlan?.supportingGrammars.length ?? 0) > 0)).toBe(true)
    expect(storyboard.every((shot) => (shot.visualPlan?.influences.length ?? 0) >= 2)).toBe(true)
    expect(storyboard.every((shot) => (shot.visualPlan?.blendRationale.length ?? 0) > 0)).toBe(true)
    expect(storyboard.every((shot) => (shot.visualPlan?.buildSteps.length ?? 0) >= 3)).toBe(true)
    expect(storyboard.every((shot) => shot.visualPlan?.generationPrompt?.includes('原创'))).toBe(true)
  })

  it('自动打散连续三镜完全相同的主辅语法组合', () => {
    const input = project()
    const base = fallbackScript(input)
    const template = base.sentences[0]
    const sentences = Array.from({ length: 6 }, (_, index) => ({
      ...template,
      id: `evidence-${index}`,
      role: 'evidence' as const,
      text: `第${index + 1}句数据证明同一个原理。`
    }))
    const script = {
      ...base,
      id: 'repetition-script',
      sentences,
      fullText: sentences.map((sentence) => sentence.text).join('\n')
    }
    const storyboard = fallbackStoryboard({
      ...input,
      scriptVersions: [script],
      activeScriptId: script.id
    })
    const signatures = storyboard.map((shot) => [
      shot.visualPlan?.grammar,
      ...(shot.visualPlan?.supportingGrammars ?? [])
    ].join('|'))

    for (let index = 2; index < signatures.length; index += 1) {
      expect(new Set(signatures.slice(index - 2, index + 1)).size).toBeGreaterThan(1)
    }
    expect(signatures[0]).toBe(signatures[1])
    expect(signatures[2]).not.toBe(signatures[1])
    expect(storyboard[2].visualPlan?.blendRationale).toContain('避免连续三镜')
  })
})

describe('远程模型兼容与兜底', () => {
  const settings = {
    providerName: '测试服务',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    imageModel: 'test-image-model',
    videoModel: 'test-video-model',
    temperature: 0.5,
    enabled: true,
    autoGenerateMedia: false,
    preferVideoGeneration: false
  }

  it('接口不支持 response_format 时自动用普通 JSON 请求重试', async () => {
    const expected = fallbackUnderstanding(project())
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('response_format is not supported', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(expected) } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<typeof expected>({ task: 'understand', project: project() }, settings)
      expect(result.summary).toBe(expected.summary)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
      expect(secondBody.response_format).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('合法 JSON 但结构错误时回退本地引擎并记录原因', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"summary":"字段不完整"}' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    try {
      const result = await runAiTask<ReturnType<typeof fallbackUnderstanding>>(
        { task: 'understand', project: project() },
        settings
      )
      expect(result.rules.length).toBeGreaterThan(0)
      expect((result as typeof result & { __fallbackReason?: string }).__fallbackReason).toContain('JSON 结构')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
