import { describe, expect, it, vi } from 'vitest'
import type { AiRequest, Project, ScriptVersion } from '../shared/types'
import { runAiTask } from './ai'
import {
  buildCreativeBrief,
  createEmptyPreferenceMemory,
  evaluateScript,
  learnPreferenceMemory,
  preserveLockedSentences,
  rankScriptCandidates
} from './creative-engine'
import { fallbackScript } from './fallback-engine'

function project(overrides: Partial<Project> = {}): Project {
  const timestamp = new Date().toISOString()
  return {
    id: 'p1',
    name: '引擎测试',
    mode: 'personal-ip',
    step: 'script',
    platform: 'douyin',
    goal: 'trust',
    durationTarget: 60,
    aspectRatio: '9:16',
    assetPolicy: 'owned-first',
    topic: '普通人如何开始做个人IP',
    audience: '有经验但害怕表达的职场人',
    coreViewpoint: '经历只有连接观众的处境，才会变成有价值的内容',
    realExperience: '第一次发专业口播时，我讲了很多资历，却没有人看完',
    desiredFeeling: '感到被理解，并愿意开始表达',
    requirements: '每句话都要和观众有关；不要编造数据；不要爹味说教',
    productName: '',
    productFacts: '',
    productOffer: '',
    cta: '写下一段你帮助别人解决问题的真实经历',
    references: [],
    assets: [],
    scriptVersions: [],
    storyboard: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

function withScript(input: Project, script: ScriptVersion): Project {
  return { ...input, scriptVersions: [script], activeScriptId: script.id }
}

describe('目标与约束解析', () => {
  it('把用户要求、内容目标、事实边界和偏好记忆分开', () => {
    const input = project()
    const memory = {
      ...createEmptyPreferenceMemory(),
      directives: ['开头不要提问，直接说出代价'],
      preferredExamples: ['最贵的不是钱，是你反复试错的时间。'],
      rejectedExamples: ['家人们，今天分享满满干货。'],
      observations: 3
    }
    const brief = buildCreativeBrief(input, undefined, memory)

    expect(brief.primaryGoal).toContain('信任')
    expect(brief.hardConstraints).toContain('每句话都要和观众有关')
    expect(brief.hardConstraints.some((item) => item.includes('不得编造'))).toBe(true)
    expect(brief.softPreferences).toContain('开头不要提问，直接说出代价')
    expect(brief.knownFacts.join(' ')).toContain('第一次发专业口播')
  })
})

describe('候选评审与锁定保护', () => {
  it('离线模式也会比较三个策略，并留下可复盘的选择报告', async () => {
    const input = project()
    const result = await runAiTask<ScriptVersion>({ task: 'script', project: input }, {
      providerName: '本地',
      baseUrl: '',
      apiKey: '',
      model: '',
      imageModel: '',
      videoModel: '',
      temperature: 0.6,
      enabled: false,
      autoGenerateMedia: false,
      preferVideoGeneration: false
    })

    expect(result.decisionReport?.candidatesCompared).toBe(3)
    expect(result.evaluation?.scores).toHaveLength(6)
    expect(result.sentences.every((sentence) => sentence.generation?.originalText)).toBe(true)
  })

  it('硬约束违规稿不会仅凭其他分数获胜', () => {
    const input = project()
    const safe = fallbackScript(input)
    const unsafe = {
      ...safe,
      id: 'unsafe',
      sentences: safe.sentences.map((sentence, index) => index === 0
        ? { ...sentence, text: '这个方法保证百分百有效，7天提升100倍。' }
        : sentence)
    }
    const brief = buildCreativeBrief(input)
    const ranked = rankScriptCandidates([
      { script: unsafe, strategy: '夸张承诺' },
      { script: safe, strategy: '事实稳健' }
    ], brief)

    expect(evaluateScript(unsafe, brief).hardConstraintPassed).toBe(false)
    expect(ranked[0].strategy).toBe('事实稳健')
  })

  it('无论模型如何改写，锁定句都按原文字和位置恢复', () => {
    const input = project()
    const source = fallbackScript(input)
    source.sentences[1] = { ...source.sentences[1], status: 'locked' }
    const revised = {
      ...source,
      sentences: source.sentences.map((sentence, index) => index === 1
        ? { ...sentence, text: '模型擅自覆盖了这句话', status: 'pass' as const }
        : sentence)
    }
    const result = preserveLockedSentences(source, revised)

    expect(result.sentences[1].text).toBe(source.sentences[1].text)
    expect(result.sentences[1].status).toBe('locked')
  })
})

describe('可控的用户偏好记忆', () => {
  it('从锁定和人工改写中学习，并对相同信号去重', () => {
    const input = project()
    const script = fallbackScript(input)
    script.sentences[0] = {
      ...script.sentences[0],
      status: 'locked',
      generation: {
        originalText: '原来很空泛的一句话',
        engineVersion: 'test',
        candidateStrategy: 'test'
      }
    }
    const request: AiRequest = { task: 'review', project: withScript(input, script) }
    const first = learnPreferenceMemory(undefined, request)
    const second = learnPreferenceMemory(first, request)

    expect(first.preferredExamples).toContain(script.sentences[0].text)
    expect(first.rejectedExamples).toContain('原来很空泛的一句话')
    expect(second.preferredExamples).toEqual(first.preferredExamples)
    expect(second.observations).toBe(first.observations)
  })
})

describe('远程候选探索与批判改写', () => {
  it('生成多稿、做第二阶段复盘，并在最终结果中保留锁定句', async () => {
    const input = project()
    const source = fallbackScript(input)
    source.sentences[0] = { ...source.sentences[0], status: 'locked' }
    const workingProject = withScript(input, source)
    const candidateA = {
      ...source,
      id: 'candidate-a',
      title: '处境稿',
      sentences: source.sentences.map((sentence) => ({ ...sentence, status: sentence.status === 'locked' ? 'locked' as const : 'pass' as const }))
    }
    const candidateB = {
      ...source,
      id: 'candidate-b',
      title: '反差稿',
      sentences: source.sentences.map((sentence, index) => index === 0
        ? { ...sentence, text: '模型在候选阶段试图覆盖锁定句', status: 'pass' as const }
        : { ...sentence, status: 'pass' as const })
    }
    const final = {
      ...candidateA,
      id: 'final',
      sentences: candidateA.sentences.map((sentence, index) => index === 0
        ? { ...sentence, text: '模型在复盘阶段再次覆盖锁定句', status: 'pass' as const }
        : sentence)
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          candidates: [
            { strategy: '观众处境', script: candidateA },
            { strategy: '认知反差', script: candidateB }
          ]
        }) } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          final,
          selectionReason: '更直接服务建立信任的目标，并保持事实边界。'
        }) } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<ScriptVersion>({
        task: 'review',
        project: workingProject,
        candidateCount: 2
      }, {
        providerName: '测试服务',
        baseUrl: 'https://example.test/v1',
        apiKey: 'test',
        model: 'test-model',
        imageModel: 'test-image-model',
        videoModel: 'test-video-model',
        temperature: 0.6,
        enabled: true,
        autoGenerateMedia: false,
        preferVideoGeneration: false
      }, {
        ...createEmptyPreferenceMemory(),
        directives: ['不用网络热词'],
        observations: 1
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.sentences[0].text).toBe(source.sentences[0].text)
      expect(result.sentences[0].status).toBe('locked')
      expect(result.decisionReport?.candidatesCompared).toBe(2)
      expect(result.evaluation?.scores).toHaveLength(6)
      const firstPayload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(firstPayload.messages[1].content).toContain('不用网络热词')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
