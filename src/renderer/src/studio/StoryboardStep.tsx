import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Captions,
  ChevronRight,
  Clapperboard,
  Image as ImageIcon,
  Layers3,
  Lock,
  MonitorPlay,
  Play,
  RefreshCw,
  Sparkles,
  Unlock,
  UserRound
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Project, StoryboardShot, ShotVisualType, VisualGrammar } from '../../../shared/types'
import { Button, Card, Field, Select, Tag, TextArea } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

const visualMeta: Record<ShotVisualType, { label: string; icon: typeof UserRound }> = {
  'talking-head': { label: '人物口播', icon: UserRound },
  screenshot: { label: '截图', icon: ImageIcon },
  'b-roll': { label: '辅助画面', icon: MonitorPlay },
  'quote-card': { label: '金句卡', icon: Captions },
  'ai-visual': { label: 'AI画面', icon: Sparkles }
}

const grammarMeta: Record<VisualGrammar, { label: string; source: string }> = {
  'dense-explainer': { label: '模块化高密度解释', source: 'GenJi 的信息画面方法' },
  'masked-typography': { label: '蒙版逐字节奏', source: '路过我的生活的字效方法' },
  'motivated-montage': { label: '动机蒙太奇', source: '南门录像厅的组接方法' },
  'photo-transformation': { label: '照片变形叙事', source: '小小小小fish 的前后变化方法' },
  'editorial-life': { label: '浅色生活叙事', source: '回天原创通用模板' },
  'spatial-stage': { label: '多层空间舞台', source: 'Z嗯 的空间调度方法' },
  'practical-demo': { label: '实操证据演示', source: '小小小小fish 的实拍教学方法' }
}

function GrammarPreview({ shot }: { shot: StoryboardShot }): ReactNode {
  const grammar = shot.visualPlan?.grammar ?? 'editorial-life'
  const supporting = shot.visualPlan?.supportingGrammars ?? []
  const title = (shot.scriptText || shot.subtitle).replace(/[，。！？；：,.!?;:]/g, ' ').trim().slice(0, 18)
  return (
    <div className={`grammar-preview grammar-preview--${grammar}`}>
      <div className="grammar-preview__top"><span>{grammarMeta[grammar].label}</span><b>{String(shot.order + 1).padStart(2, '0')}</b></div>
      <strong data-title={title}>{title}</strong>
      <div className="grammar-preview__canvas"><i /><i /><i /></div>
      {supporting.length > 0 && (
        <div className="grammar-preview__blend">
          <span>主</span>{grammarMeta[grammar].label}
          {supporting.map((item) => <span key={item}>＋ {grammarMeta[item].label}</span>)}
        </div>
      )}
      <p>{shot.visualPlan?.semanticReason || shot.visualDirection}</p>
      <small>HUITIAN · ORIGINAL</small>
    </div>
  )
}

export function StoryboardStep({ project, profile, update, go }: StepProps): ReactNode {
  const setBusy = useStudioStore((state) => state.setBusy)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [selectedId, setSelectedId] = useState(project.storyboard[0]?.id ?? '')
  const [rhythm, setRhythm] = useState('standard')
  const [motionLevel, setMotionLevel] = useState('medium')
  const selected = project.storyboard.find((shot) => shot.id === selectedId) ?? project.storyboard[0]
  const asset = project.assets.find((item) => item.id === selected?.assetId)
  const totalDuration = useMemo(() => project.storyboard.reduce((sum, shot) => sum + shot.duration, 0), [project.storyboard])

  const patchShot = (id: string, patch: Partial<StoryboardShot>): void => update({
    storyboard: project.storyboard.map((shot) => shot.id === id ? { ...shot, ...patch } : shot)
  })
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= project.storyboard.length) return
    const storyboard = [...project.storyboard]
    ;[storyboard[index], storyboard[target]] = [storyboard[target], storyboard[index]]
    update({ storyboard: storyboard.map((shot, order) => ({ ...shot, order })) })
  }
  const regenerate = async (): Promise<void> => {
    setBusy('正在重新匹配素材与动效…')
    try {
      const storyboard = await window.studio.runAiTask<Project['storyboard']>({ task: 'storyboard', project, profile })
      update({ storyboard })
      setSelectedId(storyboard[0]?.id ?? '')
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="studio-step storyboard-step">
      <div className="step-intro step-intro--with-action">
        <div><span>05</span><div><h2>画面服务表达，不抢走表达</h2><p>默认优先真人口播与自有素材，缺口再用文字卡或自动素材补充。</p></div></div>
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => go('script')}>返回文案</Button>
      </div>

      <div className="storyboard-workspace">
        <aside className="preview-column">
          <div className="phone-preview">
            <div className="phone-preview__screen">
              {asset?.mimeType.startsWith('image/') ? (
                <img src={asset.uri} alt="" />
              ) : asset?.mimeType.startsWith('video/') ? (
                <video src={asset.uri} muted controls />
              ) : (
                <div className={`preview-placeholder visual-${selected?.visualType ?? 'talking-head'}`}>
                  {selected ? <GrammarPreview shot={selected} /> : <><UserRound size={48} /><span>选择一个分镜查看画面意图</span></>}
                </div>
              )}
              {selected && <div className="preview-subtitle">{selected.subtitle}</div>}
              <div className="safe-area" />
            </div>
            <div className="phone-preview__controls"><button><Play size={16} fill="currentColor" /></button><i><b style={{ width: `${project.storyboard.length ? ((selected?.order ?? 0) + 1) / project.storyboard.length * 100 : 0}%` }} /></i><span>{Math.round(totalDuration)}s</span></div>
          </div>

          <Card className="global-style-control">
            <div className="panel-heading"><div><Layers3 size={17} /><h3>全局画面控制</h3></div></div>
            <Field label="剪辑节奏">
              <Select value={rhythm} onChange={setRhythm} options={[
                { value: 'slow', label: '舒缓，保留情绪' },
                { value: 'standard', label: '标准（推荐）' },
                { value: 'fast', label: '快速，高信息量' }
              ]} />
            </Field>
            <Field label="动效强度">
              <div className="three-state">
                {['low', 'medium', 'high'].map((value, index) => <button key={value} className={motionLevel === value ? 'is-active' : ''} onClick={() => setMotionLevel(value)}>{['低', '中', '高'][index]}</button>)}
              </div>
            </Field>
            <p className="control-note">复杂抠图置信度不足时，会自动回退到画中画或干净截图。</p>
          </Card>
        </aside>

        <main className="shots-column">
          <div className="shots-toolbar">
            <div><h3>分镜卡</h3><span>{project.storyboard.length} 个镜头 · 约 {Math.round(totalDuration)} 秒</span></div>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => void regenerate()}>重新匹配</Button>
          </div>

          <div className="shot-list">
            {project.storyboard.map((shot, index) => {
              const meta = visualMeta[shot.visualType]
              const Icon = meta.icon
              const shotAsset = project.assets.find((item) => item.id === shot.assetId)
              return (
                <article
                  key={shot.id}
                  className={`shot-card ${selected?.id === shot.id ? 'is-selected' : ''} ${shot.locked ? 'is-locked' : ''}`}
                  onClick={() => setSelectedId(shot.id)}
                >
                  <div className="shot-card__order"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
                  <div className="shot-card__thumb">
                    {shotAsset?.mimeType.startsWith('image/') ? <img src={shotAsset.uri} alt="" /> : <Icon size={23} />}
                    <Tag tone={shotAsset ? 'success' : shot.visualType === 'ai-visual' ? 'warning' : 'neutral'}>{shotAsset ? '我的素材' : shot.visualType === 'ai-visual' ? '待生成' : '自动画面'}</Tag>
                  </div>
                  <div className="shot-card__main">
                    <div className="shot-card__script">{shot.scriptText}</div>
                    {shot.visualPlan && (
                      <div className="shot-card__visual-logic">
                        <div className="visual-method-stack">
                          <Tag tone="accent">主 · {grammarMeta[shot.visualPlan.grammar].label}</Tag>
                          {(shot.visualPlan.supportingGrammars ?? []).map((item) => <Tag key={item} tone="neutral">辅 · {grammarMeta[item].label}</Tag>)}
                        </div>
                        <span>{shot.visualPlan.semanticReason}</span>
                      </div>
                    )}
                    <div className="shot-card__edit-grid">
                      <Select
                        value={shot.visualType}
                        onChange={(value) => patchShot(shot.id, { visualType: value as ShotVisualType })}
                        options={Object.entries(visualMeta).map(([value, item]) => ({ value, label: item.label }))}
                      />
                      <Select
                        value={shot.assetId ?? ''}
                        onChange={(value) => patchShot(shot.id, { assetId: value || undefined })}
                        options={[
                          { value: '', label: '自动选择画面' },
                          ...project.assets.filter((item) => item.kind !== 'reference').map((item) => ({ value: item.id, label: item.name }))
                        ]}
                      />
                    </div>
                    {selected?.id === shot.id && (
                      <div className="shot-card__expanded">
                        {shot.visualPlan && (
                          <div className="visual-plan-card">
                            <div className="visual-plan-card__heading">
                              <div><Sparkles size={14} /><strong>为什么这样组合</strong></div>
                              <span>回天融合导演</span>
                            </div>
                            <p>{shot.visualPlan.semanticReason}</p>
                            <div className="visual-plan-card__methods">
                              <Tag tone="accent">主方法 · {grammarMeta[shot.visualPlan.grammar].label}</Tag>
                              {(shot.visualPlan.supportingGrammars ?? []).map((item) => <Tag key={item} tone="neutral">辅助 · {grammarMeta[item].label}</Tag>)}
                            </div>
                            <div className="visual-plan-card__rationale">{shot.visualPlan.blendRationale || '以最能完成本句表达任务的方法为主，只叠加必要的辅助技法。'}</div>
                            <div className="visual-plan-card__source">方法取材：{(shot.visualPlan.influences?.length ? shot.visualPlan.influences : [shot.visualPlan.referenceAccount || grammarMeta[shot.visualPlan.grammar].source]).join('、')} · 已转化为回天原创组合</div>
                            <details>
                              <summary>查看具体制作方法</summary>
                              <ol>{shot.visualPlan.buildSteps.map((step, stepIndex) => <li key={`${shot.id}-build-${stepIndex}`}>{step}</li>)}</ol>
                              {shot.visualPlan.generationPrompt && <div className="visual-plan-card__prompt"><span>原创素材提示</span>{shot.visualPlan.generationPrompt}</div>}
                            </details>
                          </div>
                        )}
                        <Field label="画面意图"><TextArea rows={2} value={shot.visualDirection} onChange={(e) => patchShot(shot.id, { visualDirection: e.target.value })} /></Field>
                        <div className="form-grid form-grid--2">
                          <Field label="动效"><Select value={shot.motion} onChange={(value) => patchShot(shot.id, { motion: value })} options={[
                            { value: '无', label: '无' },
                            { value: '轻微推拉', label: '轻微推拉' },
                            { value: '截图推近 + 重点框选', label: '截图推近 + 重点框选' },
                            { value: '人像抠图叠加', label: '人像抠图叠加' },
                            { value: '画中画', label: '画中画' },
                            { value: '金句卡', label: '金句卡' }
                          ]} /></Field>
                          <Field label="转场"><Select value={shot.transition} onChange={(value) => patchShot(shot.id, { transition: value })} options={[
                            { value: '无', label: '无' },
                            { value: '快速叠化', label: '快速叠化' },
                            { value: '直接切换', label: '直接切换' },
                            { value: '遮罩切换', label: '遮罩切换' }
                          ]} /></Field>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="shot-card__side">
                    <span>{shot.duration.toFixed(1)}s</span>
                    <button onClick={(e) => { e.stopPropagation(); patchShot(shot.id, { locked: !shot.locked }) }}>{shot.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                    <button disabled={index === 0} onClick={(e) => { e.stopPropagation(); move(index, -1) }}><ArrowUp size={14} /></button>
                    <button disabled={index === project.storyboard.length - 1} onClick={(e) => { e.stopPropagation(); move(index, 1) }}><ArrowDown size={14} /></button>
                  </div>
                </article>
              )
            })}
          </div>
        </main>
      </div>

      <div className="step-footer">
        <div><Clapperboard size={17} /><span>导出会在本机调用 FFmpeg 生成粗剪，并同时整理剪映友好素材包。</span></div>
        <Button size="lg" icon={<ChevronRight size={18} />} onClick={() => { update({ step: 'export' }); go('export') }}>进入预览与导出</Button>
      </div>
    </div>
  )
}
