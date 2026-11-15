import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateOpenAiMedia,
  resolveMediaGenerationSettings,
  type MediaGenerationSettings
} from './media-generation'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'huitian-media-generation-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { recursive: true, force: true })
  )))
})

function settings(overrides: Partial<MediaGenerationSettings> = {}): MediaGenerationSettings {
  return {
    enabled: true,
    providerName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'test-secret-key',
    autoGenerateMedia: true,
    imageModel: 'gpt-image-2',
    videoModel: 'sora-2-pro',
    preferVideoGeneration: false,
    ...overrides
  }
}

describe('原创素材生成服务', () => {
  it('旧设置默认不自动花费，模型默认值保持可用', () => {
    const resolved = resolveMediaGenerationSettings({ enabled: true, apiKey: 'key' })

    expect(resolved.autoGenerateMedia).toBe(false)
    expect(resolved.preferVideoGeneration).toBe(false)
    expect(resolved.imageModel).toBe('gpt-image-2')
    expect(resolved.videoModel).toBe('sora-2-pro')
    expect(resolved.apiRoot).toBe('https://api.openai.com/v1')
  })

  it('调用图片生成接口并写入竖屏原创图片及完整溯源信息', async () => {
    const outputDirectory = await temporaryDirectory()
    const imageBytes = Buffer.from('mock-png-bytes')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ b64_json: imageBytes.toString('base64') }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await generateOpenAiMedia({
      prompt: '浅色桌面上的三个步骤卡片，原创构图',
      outputDirectory,
      fileStem: '001_original',
      durationSeconds: 3,
      requiresMotion: false,
      settings: settings()
    }, { fetch: fetchMock as typeof fetch })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?]
    expect(String(url)).toBe('https://api.openai.com/v1/images/generations')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-secret-key')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'gpt-image-2',
      size: '1024x1792',
      quality: 'high',
      output_format: 'png'
    })
    expect(await fs.readFile(result.path)).toEqual(imageBytes)
    expect(result).toMatchObject({
      generated: true,
      provider: 'OpenAI API',
      model: 'gpt-image-2',
      mediaType: 'image',
      provenance: 'remote-api-generated'
    })
    expect(JSON.stringify(result)).not.toContain('test-secret-key')
  })

  it('需要动态且用户偏好视频时，创建任务、轮询并下载竖屏 MP4', async () => {
    const outputDirectory = await temporaryDirectory()
    const videoBytes = Buffer.from('mock-mp4-bytes')
    let pollCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/videos') && init?.method === 'POST') {
        const form = init.body as FormData
        expect(form.get('model')).toBe('sora-2-pro')
        expect(form.get('size')).toBe('1024x1792')
        expect(form.get('seconds')).toBe('8')
        return new Response(JSON.stringify({ id: 'video_test', status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.endsWith('/videos/video_test/content')) {
        return new Response(videoBytes, { status: 200, headers: { 'Content-Type': 'video/mp4' } })
      }
      if (url.endsWith('/videos/video_test')) {
        pollCount += 1
        return new Response(JSON.stringify({
          id: 'video_test',
          status: pollCount === 1 ? 'in_progress' : 'completed'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('unexpected request', { status: 500 })
    })
    const sleep = vi.fn(async () => undefined)

    const result = await generateOpenAiMedia({
      prompt: '纸张卡片沿桌面依次展开，镜头缓慢推进',
      outputDirectory,
      fileStem: '002_original',
      durationSeconds: 5.2,
      requiresMotion: true,
      settings: settings({ preferVideoGeneration: true })
    }, {
      fetch: fetchMock as typeof fetch,
      sleep,
      pollIntervalMs: 1,
      maxPollAttempts: 4
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(result.path)).toEqual(videoBytes)
    expect(result).toMatchObject({
      generated: true,
      provider: 'OpenAI API',
      model: 'sora-2-pro',
      mediaType: 'video',
      apiJobId: 'video_test',
      provenance: 'remote-api-generated:video_test'
    })
  })

  it('接口失败时抛出可读错误，供导出层自动回退本地原创画面', async () => {
    const outputDirectory = await temporaryDirectory()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response('rate limit', { status: 429 })
    ))

    await expect(generateOpenAiMedia({
      prompt: '原创画面',
      outputDirectory,
      fileStem: '003_original',
      durationSeconds: 4,
      requiresMotion: false,
      settings: settings()
    }, { fetch: fetchMock as typeof fetch })).rejects.toThrow('HTTP 429')
    expect(await fs.readdir(outputDirectory)).toEqual([])
  })

  it('无效或远程明文接口地址会在发送密钥前被阻止，且不会回退到官方地址', async () => {
    expect(() => resolveMediaGenerationSettings(settings({ baseUrl: '这不是网址' })))
      .toThrow('接口地址无效')

    for (const baseUrl of ['这不是网址', 'http://provider.example/v1', 'ftp://provider.example/v1']) {
      const outputDirectory = await temporaryDirectory()
      const fetchMock = vi.fn()
      await expect(generateOpenAiMedia({
        prompt: '安全测试画面',
        outputDirectory,
        fileStem: 'blocked',
        durationSeconds: 4,
        requiresMotion: false,
        settings: settings({ baseUrl })
      }, { fetch: fetchMock as typeof fetch })).rejects.toThrow(/接口地址无效|必须使用 HTTPS/)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  })

  it('只为本机调试地址放行 HTTP', async () => {
    const outputDirectory = await temporaryDirectory()
    const imageBytes = Buffer.from('local-image')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ b64_json: imageBytes.toString('base64') }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await generateOpenAiMedia({
      prompt: '本机调试',
      outputDirectory,
      fileStem: 'localhost',
      durationSeconds: 4,
      requiresMotion: false,
      settings: settings({ baseUrl: 'http://127.0.0.1:8787/v1' })
    }, { fetch: fetchMock as typeof fetch })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:8787/v1/images/generations')
  })

  it('只提取提供方的短错误消息，并从错误对象中移除密钥、Bearer 和大段原始响应', async () => {
    const outputDirectory = await temporaryDirectory()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        message: '额度不足 Authorization: Bearer "provider-leaked-token"，请检查 api_key=test-secret-key'
      },
      raw_debug_should_not_appear: 'x'.repeat(8_000)
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }))

    let caught: Error | undefined
    try {
      await generateOpenAiMedia({
        prompt: '原创画面',
        outputDirectory,
        fileStem: 'redaction',
        durationSeconds: 4,
        requiresMotion: false,
        settings: settings()
      }, { fetch: fetchMock as typeof fetch })
    } catch (error) {
      caught = error as Error
    }

    expect(caught?.message).toContain('HTTP 429')
    expect(caught?.message).toContain('额度不足')
    expect(caught?.message).not.toContain('test-secret-key')
    expect(caught?.message).not.toContain('provider-leaked-token')
    expect(caught?.message).not.toContain('Bearer')
    expect(caught?.message).not.toContain('raw_debug_should_not_appear')
    expect(caught?.message.length).toBeLessThan(400)
  })

  it('视频任务创建后，轮询、下载和超时错误都保留 apiJobId', async () => {
    const cases = [
      {
        name: '轮询错误',
        maxPollAttempts: 2,
        fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).endsWith('/videos') && init?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'job_poll', status: 'queued' }), { status: 200 })
          }
          return new Response(JSON.stringify({ error: { message: 'Bearer test-secret-key provider failed' } }), { status: 503 })
        }),
        expectedId: 'job_poll'
      },
      {
        name: '下载错误',
        maxPollAttempts: 2,
        fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).endsWith('/videos') && init?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'job_download', status: 'completed' }), { status: 200 })
          }
          return new Response('download unavailable', { status: 502 })
        }),
        expectedId: 'job_download'
      },
      {
        name: '等待超时',
        maxPollAttempts: 1,
        fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).endsWith('/videos') && init?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'job_timeout', status: 'queued' }), { status: 200 })
          }
          return new Response(JSON.stringify({ id: 'job_timeout', status: 'queued' }), { status: 200 })
        }),
        expectedId: 'job_timeout'
      }
    ]

    for (const testCase of cases) {
      const outputDirectory = await temporaryDirectory()
      let caught: (Error & { apiJobId?: string }) | undefined
      try {
        await generateOpenAiMedia({
          prompt: testCase.name,
          outputDirectory,
          fileStem: 'video_error',
          durationSeconds: 4,
          requiresMotion: true,
          settings: settings({ preferVideoGeneration: true })
        }, {
          fetch: testCase.fetch as typeof fetch,
          sleep: async () => undefined,
          pollIntervalMs: 1,
          maxPollAttempts: testCase.maxPollAttempts
        })
      } catch (error) {
        caught = error as Error & { apiJobId?: string }
      }
      expect(caught?.apiJobId, testCase.name).toBe(testCase.expectedId)
      expect(caught?.message, testCase.name).not.toContain('test-secret-key')
      expect(caught?.message, testCase.name).not.toContain('Bearer')
    }
  })

  it('已有 pending 视频任务会恢复查询，不会再次 POST 创建付费任务', async () => {
    const outputDirectory = await temporaryDirectory()
    const jobStateDirectory = await temporaryDirectory()
    const videoBytes = Buffer.from('resumed-video')
    let pollCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/videos') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'job_resume', status: 'queued' }), { status: 200 })
      }
      if (url.endsWith('/videos/job_resume/content')) {
        return new Response(videoBytes, { status: 200 })
      }
      pollCount += 1
      return new Response(JSON.stringify({
        id: 'job_resume',
        status: pollCount === 1 ? 'queued' : 'completed'
      }), { status: 200 })
    })
    const request = {
      prompt: '同一个可恢复的视频提示词',
      outputDirectory,
      fileStem: 'resume',
      durationSeconds: 4,
      requiresMotion: true,
      jobStateDirectory,
      settings: settings({ preferVideoGeneration: true })
    }

    let firstError: (Error & { apiJobId?: string }) | undefined
    try {
      await generateOpenAiMedia(request, {
        fetch: fetchMock as typeof fetch,
        sleep: async () => undefined,
        maxPollAttempts: 1
      })
    } catch (error) {
      firstError = error as Error & { apiJobId?: string }
    }
    expect(firstError?.apiJobId).toBe('job_resume')
    const pendingFiles = await fs.readdir(jobStateDirectory)
    expect(pendingFiles).toHaveLength(1)
    const pendingContent = await fs.readFile(join(jobStateDirectory, pendingFiles[0]), 'utf8')
    expect(pendingContent).toContain('job_resume')
    expect(pendingContent).not.toContain('test-secret-key')
    expect(pendingContent).not.toContain(request.prompt)

    const result = await generateOpenAiMedia(request, {
      fetch: fetchMock as typeof fetch,
      sleep: async () => undefined,
      maxPollAttempts: 2
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(result.apiJobId).toBe('job_resume')
    expect(await fs.readFile(result.path)).toEqual(videoBytes)
    expect(await fs.readdir(jobStateDirectory)).toEqual([])
  })
})
