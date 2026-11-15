import { describe, expect, it, vi } from 'vitest'
import type { AiSettings, Project } from '../shared/types'
import { runAiTask, testConnection } from './ai'
import { fallbackUnderstanding } from './fallback-engine'

function project(): Project {
  const now = new Date().toISOString()
  return {
    id: 'responses-api-project',
    name: 'Responses API 测试',
    mode: 'personal-ip',
    step: 'setup',
    platform: 'douyin',
    goal: 'trust',
    durationTarget: 60,
    aspectRatio: '9:16',
    assetPolicy: 'owned-first',
    topic: '普通人如何建立个人 IP',
    audience: '有经验但不敢表达的职场人',
    coreViewpoint: '让经历和观众的处境发生关系',
    realExperience: '曾经只讲自己多专业，观众却不断划走',
    desiredFeeling: '被说中并愿意行动',
    requirements: '每句话都要让观众联想到自己',
    productName: '',
    productFacts: '',
    productOffer: '',
    cta: '',
    references: [],
    assets: [],
    scriptVersions: [],
    storyboard: [],
    createdAt: now,
    updatedAt: now
  }
}

function settings(baseUrl: string, model = 'test-model'): AiSettings {
  return {
    providerName: '测试服务',
    baseUrl,
    apiKey: 'test-key',
    model,
    imageModel: '',
    videoModel: '',
    temperature: 0.5,
    enabled: true,
    autoGenerateMedia: false,
    preferVideoGeneration: false
  }
}

describe('OpenAI Responses API 路由', () => {
  it('官方 OpenAI 地址使用 Responses API，并拼接所有 output_text 内容片段', async () => {
    const input = project()
    input.exportResult = {
      directory: 'C:\\Users\\creator\\Desktop\\private-export',
      files: ['C:\\Users\\creator\\Desktop\\private-export\\video.mp4'],
      warnings: [],
      createdAt: new Date().toISOString()
    }
    input.references = [
      { id: 'local-reference', type: 'file', value: 'C:\\Users\\creator\\Videos\\reference.mp4', focus: 'both' },
      { id: 'link-reference', type: 'link', value: 'https://example.com/reference', focus: 'copy' }
    ]
    input.assets = [{
      id: 'asset-1',
      name: '口播.mp4',
      path: 'C:\\Users\\creator\\Videos\\talking-head.mp4',
      uri: 'file:///C:/Users/creator/Videos/talking-head.mp4',
      kind: 'talking-head',
      mimeType: 'video/mp4',
      size: 123,
      status: 'ready'
    }]
    const expected = fallbackUnderstanding(input)
    const json = JSON.stringify(expected)
    const splitAt = Math.floor(json.length / 2)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: json.slice(0, splitAt), annotations: [] },
            { type: 'output_text', text: json.slice(splitAt), annotations: [] }
          ]
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<typeof expected>(
        { task: 'understand', project: input },
        settings('https://api.openai.com/v1/chat/completions', 'gpt-5.6')
      )

      expect(result.summary).toBe(expected.summary)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses')
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
      expect(body.instructions).toEqual(expect.any(String))
      expect(body.input).toEqual(expect.any(String))
      expect(body.messages).toBeUndefined()
      expect(body.text).toEqual({ format: { type: 'json_object' } })
      expect(body.reasoning).toEqual({ effort: 'high' })
      expect(body.temperature).toBeUndefined()
      expect(body.store).toBe(false)
      expect(body.max_output_tokens).toBe(32_000)
      const sentProject = JSON.parse(body.input).project
      expect(sentProject.exportResult).toBeUndefined()
      expect(sentProject.references).toEqual([
        expect.objectContaining({ id: 'local-reference', value: 'reference.mp4' }),
        expect.objectContaining({ id: 'link-reference', value: 'https://example.com/reference' })
      ])
      expect(sentProject.assets[0]).toEqual(expect.objectContaining({ id: 'asset-1', name: '口播.mp4' }))
      expect(JSON.stringify(sentProject.assets[0])).not.toContain('C:\\Users')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('第三方兼容地址继续使用 Chat Completions 协议', async () => {
    const input = project()
    const expected = fallbackUnderstanding(input)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(expected) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<typeof expected>(
        { task: 'understand', project: input },
        settings('https://provider.example/v1')
      )

      expect(result.summary).toBe(expected.summary)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://provider.example/v1/chat/completions')
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
      expect(body.messages).toHaveLength(2)
      expect(body.instructions).toBeUndefined()
      expect(body.response_format).toEqual({ type: 'json_object' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('非 JSON 格式类的 400 错误不会触发错误的格式降级重试', async () => {
    const input = project()
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      'unsupported model for this account',
      { status: 400 }
    ))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<ReturnType<typeof fallbackUnderstanding>>(
        { task: 'understand', project: input },
        settings('https://api.openai.com/v1', 'gpt-5.6')
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect((result as typeof result & { __fallbackReason?: string }).__fallbackReason)
        .toContain('unsupported model for this account')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('无效、远程 HTTP 和带凭据的地址都会在密钥发送前被阻止', async () => {
    for (const baseUrl of [
      '不是网址',
      'http://provider.example/v1',
      'https://user:password@provider.example/v1'
    ]) {
      const input = project()
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      try {
        const result = await runAiTask<ReturnType<typeof fallbackUnderstanding>>(
          { task: 'understand', project: input },
          settings(baseUrl)
        )
        const reason = (result as typeof result & { __fallbackReason?: string }).__fallbackReason
        expect(reason).toMatch(/接口地址无效|必须使用 HTTPS|不能包含用户名或密码/)
        expect(fetchMock).not.toHaveBeenCalled()

        const connection = await testConnection(settings(baseUrl))
        expect(connection.ok).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('HTTP 只允许本机地址用于兼容服务调试', async () => {
    const input = project()
    const expected = fallbackUnderstanding(input)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(expected) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<typeof expected>(
        { task: 'understand', project: input },
        settings('http://localhost:8787/v1')
      )
      expect(result.summary).toBe(expected.summary)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8787/v1/chat/completions')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('模型错误只保留短消息，并脱敏 API key、Bearer 与原始调试响应', async () => {
    const input = project()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: '账户额度不足 Authorization: Bearer "provider-leaked-token"；api_key=test-key'
      },
      raw_debug_should_not_appear: 'x'.repeat(8_000)
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await runAiTask<ReturnType<typeof fallbackUnderstanding>>(
        { task: 'understand', project: input },
        settings('https://api.openai.com/v1', 'gpt-5.6')
      )
      const reason = (result as typeof result & { __fallbackReason?: string }).__fallbackReason ?? ''
      expect(reason).toContain('429')
      expect(reason).toContain('账户额度不足')
      expect(reason).not.toContain('test-key')
      expect(reason).not.toContain('provider-leaked-token')
      expect(reason).not.toContain('Bearer')
      expect(reason).not.toContain('raw_debug_should_not_appear')
      expect(reason.length).toBeLessThan(400)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
