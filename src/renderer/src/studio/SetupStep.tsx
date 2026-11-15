import {
  ChevronDown,
  FileVideo2,
  Image as ImageIcon,
  Link2,
  Mic2,
  MonitorPlay,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  AssetKind,
  AssetPolicy,
  ContentGoal,
  CreativeMode,
  Platform,
  Project,
  ReferenceItem
} from '../../../shared/types'
import { Button, Card, Field, Select, Tag, TextArea, TextInput } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

const modes: Array<{ id: CreativeMode; title: string; description: string; icon: typeof UserRound; color: string }> = [
  { id: 'personal-ip', title: '个人IP', description: '观点、故事、知识和真实表达', icon: UserRound, color: 'orange' },
  { id: 'new-media', title: '新媒体通用', description: '品牌、热点、活动和账号内容', icon: UsersRound, color: 'teal' },
  { id: 'ecommerce', title: '电商营销', description: '商品口播、种草与转化视频', icon: ShoppingBag, color: 'violet' }
]

const policies: Array<{ id: AssetPolicy; title: string; description: string }> = [
  { id: 'owned-only', title: '只用我的素材', description: '保持完全真实，不自动补画面' },
  { id: 'owned-first', title: '我的素材优先', description: '缺少时由软件补充，个人IP推荐' },
  { id: 'auto-first', title: '软件自动制作', description: '以自动素材和文字包装为主' }
]

const uploadButtons: Array<{ kind: AssetKind; label: string; icon: typeof Mic2 }> = [
  { kind: 'talking-head', label: '上传口播', icon: Mic2 },
  { kind: 'screenshot', label: '截图 / 照片', icon: ImageIcon },
  { kind: 'video', label: '辅助视频', icon: FileVideo2 },
  { kind: 'screen-recording', label: '上传录屏', icon: MonitorPlay }
]

const platformLabels: Record<Platform, string> = {
  douyin: '抖音',
  'wechat-video': '视频号',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  other: '其他平台'
}

const policyLabels: Record<AssetPolicy, string> = {
  'owned-only': '只用你的素材',
  'owned-first': '优先使用你的素材',
  'auto-first': '优先自动制作素材'
}

function formatSize(size: number): string {
  return size < 1024 ** 2 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB`
}

export function SetupStep({ project, profile, update, go }: StepProps): ReactNode {
  const data = useStudioStore((state) => state.data)
  const setBusy = useStudioStore((state) => state.setBusy)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [referenceLink, setReferenceLink] = useState('')
  const [referenceFocus, setReferenceFocus] = useState<ReferenceItem['focus']>('both')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const addLink = (): void => {
    const value = referenceLink.trim()
    if (!value) return
    update({
      references: [...project.references, {
        id: crypto.randomUUID(),
        type: 'link',
        value,
        focus: referenceFocus
      }]
    })
    setReferenceLink('')
  }

  const upload = async (kind: AssetKind): Promise<void> => {
    const assets = await window.studio.selectFiles({ kind, multiple: true })
    if (!assets.length) return
    if (kind === 'reference') {
      const references = assets.map((asset) => ({
        id: crypto.randomUUID(),
        type: 'file' as const,
        value: asset.name,
        focus: referenceFocus,
        assetId: asset.id
      }))
      update({ assets: [...project.assets, ...assets], references: [...project.references, ...references] })
    } else {
      update({ assets: [...project.assets, ...assets] })
    }
  }

  const removeAsset = (id: string): void => {
    update({
      assets: project.assets.filter((asset) => asset.id !== id),
      references: project.references.filter((reference) => reference.assetId !== id)
    })
  }

  const removeReference = (id: string): void => update({ references: project.references.filter((reference) => reference.id !== id) })

  const analyze = async (): Promise<void> => {
    if (!project.topic.trim() && !project.coreViewpoint.trim() && !project.productName.trim()) {
      setNotice({ type: 'error', message: '先写下本期主题、核心观点或商品名称。' })
      return
    }
    setBusy('正在把自然语言要求变成可执行规则…')
    try {
      const understanding = await window.studio.runAiTask<Project['understanding']>({
        task: 'understand',
        project,
        profile
      })
      update({ understanding, step: 'understanding' })
      go('understanding')
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="studio-step setup-step setup-step--simple">
      <div className="quick-start">
        <div className="quick-start__heading">
          <span className="quick-start__spark"><Sparkles size={18} /></span>
          <div>
            <h2>你想做一条什么内容？</h2>
            <p>像和一个懂内容的导演聊天一样说就行。没写的部分，AI会先理解和补全。</p>
          </div>
        </div>

        <Card className="quick-composer">
          <TextArea
            className="quick-composer__input"
            rows={8}
            autoFocus
            placeholder={'例如：我想做一条个人IP口播，讲“普通人不是没有内容，而是总觉得自己的经历不值得讲”。要从人性出发，让每句话都和观众有关，开头有冲突感，结尾让人想关注我。\n\n不必整理，零散想法、目标、文案要求都可以直接写在这里。'}
            value={project.topic}
            onChange={(event) => update({ topic: event.target.value })}
          />

          {project.assets.filter((asset) => asset.kind !== 'reference').length > 0 && (
            <div className="quick-assets">
              {project.assets.filter((asset) => asset.kind !== 'reference').map((asset) => (
                <div key={asset.id} className="quick-asset">
                  <span>{asset.mimeType.startsWith('image/') ? <ImageIcon size={14} /> : <FileVideo2 size={14} />}</span>
                  <strong title={asset.name}>{asset.name}</strong>
                  <small>{formatSize(asset.size)}</small>
                  <button aria-label={`移除 ${asset.name}`} onClick={() => removeAsset(asset.id)}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="quick-composer__toolbar">
            <div className="quick-upload-actions">
              <span>素材可选</span>
              <button onClick={() => void upload('talking-head')}><FileVideo2 size={16} />口播视频</button>
              <button onClick={() => void upload('screenshot')}><ImageIcon size={16} />图片 / 截图</button>
            </div>
            <Button size="lg" icon={<Sparkles size={18} />} onClick={() => void analyze()}>
              一键开始创作
            </Button>
          </div>
        </Card>

        <div className="quick-start__bottom">
          <button className={advancedOpen ? 'is-open' : ''} onClick={() => setAdvancedOpen((value) => !value)}>
            <SlidersHorizontal size={15} />
            {advancedOpen ? '收起高级设置' : '需要更精确？展开高级设置（全部选填）'}
            <ChevronDown size={15} />
          </button>
          <span>
            当前：{modes.find((mode) => mode.id === project.mode)?.title} · {platformLabels[project.platform]} · {project.durationTarget}秒 · {policyLabels[project.assetPolicy]}
          </span>
        </div>
      </div>

      {advancedOpen && <div className="advanced-setup">
      <Card className="form-section">
        <div className="form-section__heading">
          <div><h3>选择创作模式</h3><p>只是切换创作流程，不会把你限制在一种内容里。</p></div>
        </div>
        <div className="mode-picker">
          {modes.map((mode) => {
            const Icon = mode.icon
            return (
              <button
                key={mode.id}
                className={`${project.mode === mode.id ? 'is-active' : ''} color-${mode.color}`}
                onClick={() => update({ mode: mode.id })}
              >
                <span><Icon size={21} /></span>
                <div><strong>{mode.title}</strong><small>{mode.description}</small></div>
                <i />
              </button>
            )
          })}
        </div>
      </Card>

      <div className="setup-columns">
        <div className="setup-main">
          <Card className="form-section">
            <div className="form-section__heading"><div><h3>本期内容</h3><p>越真实具体，文案越不容易变成“AI正确废话”。</p></div></div>
            <div className="form-grid form-grid--2">
              <Field label="项目名称"><TextInput value={project.name} onChange={(e) => update({ name: e.target.value })} /></Field>
              <Field label="选择IP / 品牌档案">
                <Select
                  value={project.profileId ?? ''}
                  onChange={(value) => update({ profileId: value || undefined })}
                  options={[{ value: '', label: '不使用档案' }, ...(data?.profiles ?? []).map((item) => ({ value: item.id, label: item.name }))]}
                />
              </Field>
              <Field label="发布平台">
                <Select
                  value={project.platform}
                  onChange={(value) => update({ platform: value as Platform })}
                  options={[
                    { value: 'douyin', label: '抖音' },
                    { value: 'wechat-video', label: '视频号' },
                    { value: 'xiaohongshu', label: '小红书' },
                    { value: 'bilibili', label: 'B站' },
                    { value: 'other', label: '其他' }
                  ]}
                />
              </Field>
              <Field label="内容目标">
                <Select
                  value={project.goal}
                  onChange={(value) => update({ goal: value as ContentGoal })}
                  options={[
                    { value: 'followers', label: '吸引关注' },
                    { value: 'trust', label: '建立信任' },
                    { value: 'discussion', label: '引发讨论' },
                    { value: 'traffic', label: '导流' },
                    { value: 'conversion', label: '促进转化' },
                    { value: 'custom', label: '其他' }
                  ]}
                />
              </Field>
              <Field label="目标观众（选填）" className="span-2">
                <TextInput
                  placeholder={profile?.audience || '例如：想做个人IP，但觉得自己没什么可讲的普通职场人'}
                  value={project.audience}
                  onChange={(e) => update({ audience: e.target.value })}
                />
              </Field>
              <Field label={project.mode === 'ecommerce' ? '商品 / 本期主题' : '本期主题或零散想法'} className="span-2">
                <TextArea
                  rows={5}
                  placeholder="不用整理，想到什么就写什么。也可以只写一句不完整的想法。"
                  value={project.topic}
                  onChange={(e) => update({ topic: e.target.value })}
                />
              </Field>
              {project.mode !== 'ecommerce' && (
                <>
                  <Field label="本期核心观点"><TextArea rows={3} placeholder="你真正想让观众明白什么？" value={project.coreViewpoint} onChange={(e) => update({ coreViewpoint: e.target.value })} /></Field>
                  <Field label="真实经历或案例"><TextArea rows={3} placeholder="一个场景、一次失败、一个人或一个细节" value={project.realExperience} onChange={(e) => update({ realExperience: e.target.value })} /></Field>
                </>
              )}
              {project.mode === 'ecommerce' && (
                <>
                  <Field label="商品名称"><TextInput value={project.productName} onChange={(e) => update({ productName: e.target.value })} /></Field>
                  <Field label="价格 / 活动"><TextInput value={project.productOffer} onChange={(e) => update({ productOffer: e.target.value })} /></Field>
                  <Field label="可证明的商品事实" className="span-2"><TextArea rows={4} placeholder="参数、材质、检测、使用方式等。没有依据的效果不要填写。" value={project.productFacts} onChange={(e) => update({ productFacts: e.target.value })} /></Field>
                </>
              )}
              <Field label="希望观众产生的感受"><TextInput placeholder="例如：被说中、松一口气、想马上行动" value={project.desiredFeeling} onChange={(e) => update({ desiredFeeling: e.target.value })} /></Field>
              <Field label="视频时长">
                <Select
                  value={project.durationTarget}
                  onChange={(value) => update({ durationTarget: Number(value) })}
                  options={[15, 30, 45, 60, 90].map((value) => ({ value, label: `${value} 秒` }))}
                />
              </Field>
              <Field label="本次具体要求（选填）" className="span-2">
                <TextArea
                  rows={5}
                  value={project.requirements}
                  onChange={(e) => update({ requirements: e.target.value })}
                  placeholder="例如：从人性的角度出发，让观众每句话都能联想到自己，不要让人觉得关我屁事。"
                />
              </Field>
              <Field label="结尾动作 / CTA" className="span-2"><TextInput placeholder="不填则由软件根据目标设计" value={project.cta} onChange={(e) => update({ cta: e.target.value })} /></Field>
            </div>
          </Card>

          <Card className="form-section">
            <div className="form-section__heading">
              <div><h3>对标内容</h3><p>当前先记录来源和学习方向；请把你已总结的重点写进上方要求。新视频的自动转写、抽帧与提炼尚未接入。</p></div>
              <Select
                value={referenceFocus}
                onChange={(value) => setReferenceFocus(value as ReferenceItem['focus'])}
                options={[
                  { value: 'both', label: '学习文案 + 画面' },
                  { value: 'copy', label: '只学文案' },
                  { value: 'visual', label: '只学画面' }
                ]}
              />
            </div>
            <div className="reference-add">
              <div className="input-with-icon"><Link2 size={16} /><TextInput value={referenceLink} onChange={(e) => setReferenceLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="粘贴对标链接（当前记录来源，不自动抓取）" /></div>
              <Button variant="secondary" onClick={addLink}>添加链接</Button>
              <Button variant="soft" icon={<Upload size={16} />} onClick={() => void upload('reference')}>上传对标视频（存档）</Button>
            </div>
            {project.references.length > 0 && (
              <div className="reference-list">
                {project.references.map((reference) => (
                  <div key={reference.id}>
                    {reference.type === 'link' ? <Link2 size={16} /> : <FileVideo2 size={16} />}
                    <span title={reference.value}>{reference.value}</span>
                    <Tag tone="neutral">{reference.focus === 'both' ? '文案+画面' : reference.focus === 'copy' ? '文案' : '画面'}</Tag>
                    <button onClick={() => removeReference(reference.id)}><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="setup-side">
          <Card className="form-section sticky-card">
            <div className="form-section__heading"><div><h3>我的素材</h3><p>个人IP默认优先使用真实口播。</p></div></div>
            <div className="policy-picker">
              {policies.map((policy) => (
                <button key={policy.id} className={project.assetPolicy === policy.id ? 'is-active' : ''} onClick={() => update({ assetPolicy: policy.id })}>
                  <i /><div><strong>{policy.title}</strong><small>{policy.description}</small></div>
                </button>
              ))}
            </div>
            <div className="upload-grid">
              {uploadButtons.map((item) => {
                const Icon = item.icon
                return <button key={item.kind} onClick={() => void upload(item.kind)}><Icon size={19} /><span>{item.label}</span><Plus size={14} /></button>
              })}
            </div>
            {project.assets.filter((asset) => asset.kind !== 'reference').length > 0 && (
              <div className="asset-mini-list">
                {project.assets.filter((asset) => asset.kind !== 'reference').map((asset) => (
                  <div key={asset.id}>
                    <div className="asset-mini-list__thumb">
                      {asset.mimeType.startsWith('image/') ? <img src={asset.uri} alt="" /> : <FileVideo2 size={17} />}
                    </div>
                    <div><strong title={asset.name}>{asset.name}</strong><small>{formatSize(asset.size)}{asset.duration ? ` · ${asset.duration.toFixed(1)}秒` : ''}</small></div>
                    <button onClick={() => removeAsset(asset.id)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="analysis-promise">
              <Sparkles size={17} />
              <p>下一步先展示“软件对你的理解”，确认后才会开始写文案。</p>
            </div>
            <Button size="lg" className="full-width" icon={<Sparkles size={18} />} onClick={() => void analyze()}>
              分析创作要求
            </Button>
          </Card>
        </aside>
      </div>
      </div>}
    </div>
  )
}
