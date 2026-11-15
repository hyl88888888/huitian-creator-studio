import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Film,
  FolderOpen,
  ImagePlus,
  KeyRound,
  Save,
  ShieldCheck,
  Wifi
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AiSettings } from '../../../shared/types'
import { Button, Card, Field, Select, TextInput } from '../components/Ui'
import { useStudioStore } from '../store'

function CapabilitySwitch({
  icon,
  title,
  description,
  checked,
  onChange,
  stateLabel,
  children
}: {
  icon: ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  stateLabel: string
  children?: ReactNode
}): ReactNode {
  return (
    <section className={`capability-switch ${checked ? 'is-active' : ''}`}>
      <div className="capability-switch__top">
        <div className="capability-switch__icon">{icon}</div>
        <div className="capability-switch__copy">
          <div className="capability-switch__title-row">
            <h3>{title}</h3>
            <span>{stateLabel}</span>
          </div>
          <p>{description}</p>
        </div>
        <label className="switch" aria-label={title}>
          <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
          <span />
        </label>
      </div>
      {children}
    </section>
  )
}

export function SettingsPage(): ReactNode {
  const data = useStudioStore((state) => state.data)
  const updateData = useStudioStore((state) => state.updateData)
  const saveNow = useStudioStore((state) => state.saveNow)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [draft, setDraft] = useState<AiSettings | null>(data?.settings.ai ?? null)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => setDraft(data?.settings.ai ?? null), [data?.settings.ai])

  if (!data || !draft) return null

  const patch = (next: Partial<AiSettings>): void => setDraft((current) => current ? { ...current, ...next } : current)
  const save = async (): Promise<void> => {
    updateData((current) => ({ ...current, settings: { ...current.settings, ai: draft } }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await saveNow()
    if (draft.apiKey && !/^•+$/.test(draft.apiKey)) {
      const redacted = { ...draft, apiKey: '••••••••••••' }
      setDraft(redacted)
      updateData((current) => ({ ...current, settings: { ...current.settings, ai: redacted } }))
    }
    setNotice({ type: 'success', message: '创作设置已安全保存。' })
  }
  const test = async (): Promise<void> => {
    setTesting(true)
    setTestMessage('')
    const result = await window.studio.testAiConnection(draft)
    setTesting(false)
    setTestMessage(result.message)
  }
  const chooseDirectory = async (): Promise<void> => {
    const directory = await window.studio.chooseExportDirectory()
    if (directory) {
      updateData((current) => ({
        ...current,
        settings: { ...current.settings, defaultExportDirectory: directory }
      }))
    }
  }

  return (
    <main className="page settings-page">
      <header className="page-header page-header--compact">
        <div>
          <div className="eyebrow"><Cloud size={14} />创作能力与本地设置</div>
          <h1>设置</h1>
          <p>平时只需决定两个开关；模型地址、密钥等技术项已经收进“高级连接设置”。</p>
        </div>
        <Button icon={<Save size={17} />} onClick={() => void save()}>保存设置</Button>
      </header>

      <div className="settings-layout">
        <Card className="settings-card settings-card--creative">
          <div className="card-heading">
            <div className="card-heading__icon"><BrainCircuit size={20} /></div>
            <div>
              <h2>回天高级创作</h2>
              <p>联网负责真正的语义理解、使用已填写或已提取的对标信息，以及缺口素材生成；本地仍保留可运行的兜底能力。</p>
            </div>
          </div>

          <div className="capability-list">
            <CapabilitySwitch
              icon={<Wifi size={20} />}
              title="联网高级创作"
              description="让回天高级文案大脑吃透你的目的、受众、对标要求与反馈，再多稿比较、审稿和重写。"
              checked={draft.enabled}
              onChange={(enabled) => patch({ enabled, ...(enabled ? {} : { autoGenerateMedia: false }) })}
              stateLabel={draft.enabled ? '已开启' : '未开启'}
            >
              <div className="capability-tags">
                <span>文案语义理解</span><span>对标要求整理</span><span>多轮审稿</span>
              </div>
              {draft.enabled && !draft.apiKey && (
                <p className="capability-hint is-warning">首次使用还需在下方“高级连接设置”中填一次访问密钥。</p>
              )}
            </CapabilitySwitch>

            <CapabilitySwitch
              icon={<ImagePlus size={20} />}
              title="素材不足自动补画"
              description="永远优先使用你上传的口播、截图和实拍；只有画面确实缺口时，才按文案语义生成原创补充素材。"
              checked={draft.autoGenerateMedia}
              onChange={(autoGenerateMedia) => patch({
                autoGenerateMedia,
                ...(autoGenerateMedia ? { enabled: true } : {})
              })}
              stateLabel={draft.autoGenerateMedia ? '自动补齐' : '只用上传素材'}
            >
              {draft.autoGenerateMedia ? (
                <div className="media-preference">
                  <div className="media-preference__label"><Film size={16} />缺口素材偏好</div>
                  <Select
                    value={draft.preferVideoGeneration ? 'video' : 'image'}
                    onChange={(value) => patch({ preferVideoGeneration: value === 'video' })}
                    options={[
                      { value: 'image', label: '图片优先（推荐，更快）' },
                      { value: 'video', label: '视频优先（动态更强，更慢且费用更高）' }
                    ]}
                  />
                </div>
              ) : (
                <p className="capability-hint">默认关闭以避免意外产生素材生成费用；需要自动成片时再由你开启。</p>
              )}
              <p className="capability-hint">
                每次真正联网补素材前都会显示预计图片/视频任务数并再次确认。软件不会自行叠加“AI生成”大字，但会在项目内部保留素材来源，方便你核对和管理。
              </p>
              {draft.autoGenerateMedia && draft.preferVideoGeneration && /^sora-2(?:-pro)?(?:-|$)/i.test(draft.videoModel.trim()) && (
                <p className="capability-hint is-warning">当前 Sora 2 视频接口已公告将在 2026 年 9 月 24 日停止；现阶段可试用，但正式商业发布前应换成新的可用视频服务。图片补画与本地动态兜底不受影响。</p>
              )}
            </CapabilitySwitch>
          </div>

          <div className="responsibility-note">
            <ShieldCheck size={19} />
            <div>
              <strong>画面可干净，来源不可造假</strong>
              <p>不会删除第三方服务强制附带的水印或内容凭证，也不会把生成画面伪装成新闻、聊天记录、成交数据等真实证据。</p>
            </div>
          </div>

          <details className="advanced-settings">
            <summary><span>高级连接设置</span><small>模型、接口地址与密钥</small><ChevronDown size={17} /></summary>
            <div className="advanced-settings__body">
              <div className="form-grid form-grid--2">
                <Field label="创作服务名称">
                  <TextInput value={draft.providerName} onChange={(event) => patch({ providerName: event.target.value })} />
                </Field>
                <Field label="文案模型">
                  <TextInput value={draft.model} onChange={(event) => patch({ model: event.target.value })} />
                </Field>
                <Field label="图片模型">
                  <TextInput value={draft.imageModel} onChange={(event) => patch({ imageModel: event.target.value })} />
                </Field>
                <Field label="视频模型" hint="视频通道可替换；默认 Sora 2 Pro 已临近官方停用日期。">
                  <TextInput value={draft.videoModel} onChange={(event) => patch({ videoModel: event.target.value })} />
                </Field>
                <Field label="接口地址" className="span-2" hint="已预填官方接口。使用其他兼容服务时再修改。">
                  <TextInput value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
                </Field>
                <Field label="访问密钥" className="span-2" hint="使用 Windows 系统加密保存在本机，不会写入项目或导出文件。">
                  <div className="input-with-icon">
                    <KeyRound size={16} />
                    <TextInput
                      type="password"
                      value={draft.apiKey}
                      onFocus={(event) => { if (/^•+$/.test(event.currentTarget.value)) event.currentTarget.select() }}
                      onChange={(event) => patch({ apiKey: event.target.value })}
                      placeholder="sk-••••••••"
                    />
                  </div>
                </Field>
                <Field label="兼容接口创作自由度" hint="只影响支持 temperature 的兼容模型；默认 GPT-5.6 固定使用高质量推理。">
                  <Select
                    value={draft.temperature}
                    onChange={(value) => patch({ temperature: Number(value) })}
                    options={[
                      { value: 0.45, label: '严谨稳定' },
                      { value: 0.72, label: '平衡（推荐）' },
                      { value: 0.9, label: '更有创意' }
                    ]}
                  />
                </Field>
                <div className="field field--action">
                  <span className="field__label">连接状态</span>
                  <Button variant="secondary" loading={testing} onClick={() => void test()}>测试连接</Button>
                </div>
              </div>

              {testMessage && (
                <div className={`test-result ${testMessage.includes('成功') ? 'is-success' : 'is-error'}`}>
                  <CheckCircle2 size={17} />{testMessage}
                </div>
              )}
            </div>
          </details>
        </Card>

        <Card className="settings-card settings-card--storage">
          <div className="card-heading">
            <div className="card-heading__icon muted"><FolderOpen size={20} /></div>
            <div><h2>导出与存储</h2><p>项目与素材优先留在本机。</p></div>
          </div>
          <Field label="默认导出目录">
            <div className="directory-picker">
              <TextInput readOnly value={data.settings.defaultExportDirectory} placeholder="每次导出时询问" />
              <Button variant="secondary" onClick={() => void chooseDirectory()}>选择目录</Button>
            </div>
          </Field>
          <div className="settings-note">
            <strong>联网究竟用在哪里？</strong>
            <p>只在你主动创作时，用于理解文案要求、使用你填写或软件已经提取的对标信息、生成与复审文案，以及在上传素材不足时补图片或视频。</p>
          </div>
          <div className="settings-note">
            <strong>哪些内容会发出去？</strong>
            <p>项目和密钥仍保存在本机；启用联网功能后，完成当前任务所需的文字、对标信息或待生成画面的描述，会发送给你连接的模型服务。</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
