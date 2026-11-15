import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FilePlus2,
  Lock,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlock
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Project, ScriptScoreDimension, ScriptSentence, ScriptVersion } from '../../../shared/types'
import { Button, Card, ScoreRing, Tag } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

const roleLabels: Record<ScriptSentence['role'], string> = {
  situation: '处境',
  benefit: '利益',
  loss: '损失',
  emotion: '情绪',
  identity: '身份',
  story: '故事',
  evidence: '证据',
  turn: '转折',
  cta: '行动'
}

const scoreLabels: Record<ScriptScoreDimension, string> = {
  goalAlignment: '目标推进',
  audienceRelevance: '观众关联',
  specificity: '具体可信',
  emotionalTension: '情绪张力',
  oralFluency: '口播流畅',
  constraintCompliance: '要求执行'
}

function activeScript(project: StepProps['project']): ScriptVersion | undefined {
  return project.scriptVersions.find((version) => version.id === project.activeScriptId) ?? project.scriptVersions.at(-1)
}

export function ScriptStep({ project, profile, update, go }: StepProps): ReactNode {
  const script = activeScript(project)
  const setBusy = useStudioStore((state) => state.setBusy)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)

  const totals = useMemo(() => {
    if (!script) return { pass: 0, improve: 0, fail: 0 }
    return script.sentences.reduce((result, sentence) => {
      const key = sentence.status === 'locked' ? 'pass' : sentence.status
      result[key] += 1
      return result
    }, { pass: 0, improve: 0, fail: 0 })
  }, [script])

  if (!script) return null

  const replaceScript = (next: ScriptVersion): void => update({
    scriptVersions: project.scriptVersions.map((version) => version.id === script.id ? next : version)
  })

  const patchSentence = (id: string, patch: Partial<ScriptSentence>): void => {
    const sentences = script.sentences.map((sentence) => sentence.id === id ? { ...sentence, ...patch } : sentence)
    replaceScript({
      ...script,
      sentences,
      fullText: sentences.map((sentence) => sentence.text).join('\n'),
      estimatedSeconds: Math.round(sentences.reduce((sum, sentence) => sum + sentence.estimatedSeconds, 0))
    })
  }

  const review = async (instruction = '重新逐句检查，只修复未通过或建议优化的句子，保留已经锁定的内容。'): Promise<void> => {
    setBusy('正在逐句运行“关我何事”检查…')
    try {
      const reviewed = await window.studio.runAiTask<ScriptVersion>({
        task: 'review',
        project,
        profile,
        additionalInstruction: instruction
      })
      const sentences = script.sentences.map((current, index) => {
        if (current.status === 'locked' || current.status === 'pass') return current
        const replacement = reviewed.sentences.find((sentence) => sentence.id === current.id)
          ?? reviewed.sentences[index]
        return replacement ? { ...replacement, id: current.id } : current
      })
      const next = {
        ...reviewed,
        id: crypto.randomUUID(),
        title: `${script.title.replace(/｜.*$/, '')}｜优化版`,
        sentences,
        fullText: sentences.map((sentence) => sentence.text).join('\n'),
        estimatedSeconds: Math.round(sentences.reduce((sum, sentence) => sum + sentence.estimatedSeconds, 0)),
        complianceScore: reviewed.evaluation?.totalScore
          ?? Math.round(sentences.reduce((sum, sentence) => sum + sentence.check.score, 0) / Math.max(1, sentences.length)),
        createdAt: new Date().toISOString()
      }
      update({ scriptVersions: [...project.scriptVersions, next], activeScriptId: next.id })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  const duplicateVersion = (): void => {
    const clone: ScriptVersion = {
      ...script,
      id: crypto.randomUUID(),
      title: `${script.title} 副本`,
      sentences: script.sentences.map((sentence) => ({ ...sentence, id: crypto.randomUUID() })),
      createdAt: new Date().toISOString()
    }
    update({ scriptVersions: [...project.scriptVersions, clone], activeScriptId: clone.id })
  }

  const generateStoryboard = async (): Promise<void> => {
    setBusy('正在按语义拆分镜头并优先匹配你的素材…')
    try {
      const storyboard = await window.studio.runAiTask<Project['storyboard']>({
        task: 'storyboard',
        project,
        profile
      })
      update({ storyboard, step: 'storyboard' })
      go('storyboard')
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="studio-step script-step">
      <div className="step-intro step-intro--with-action">
        <div><span>04</span><div><h2>逐句写，也逐句验收</h2><p>“与观众有关”按上下文判断，不机械要求每句话都出现“你”。</p></div></div>
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => go('blueprint')}>返回创作蓝图</Button>
      </div>

      <div className="script-layout">
        <div className="script-editor">
          <div className="script-toolbar">
            <div>
              <h3>{script.title}</h3>
              <span><Clock3 size={14} />预计 {script.estimatedSeconds} 秒 · {script.sentences.length} 句</span>
            </div>
            <div className="button-row">
              <Button variant="ghost" size="sm" icon={<Copy size={15} />} onClick={duplicateVersion}>保存副本</Button>
              <div className="version-switcher">
                <Button variant="secondary" size="sm" icon={<FilePlus2 size={15} />} onClick={() => setShowVersions(!showVersions)}>
                  版本 {project.scriptVersions.length}
                </Button>
                {showVersions && (
                  <div className="version-menu">
                    {project.scriptVersions.map((version, index) => (
                      <button
                        key={version.id}
                        className={version.id === script.id ? 'is-active' : ''}
                        onClick={() => { update({ activeScriptId: version.id }); setShowVersions(false) }}
                      >
                        <span>V{index + 1}</span><div><strong>{version.title}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small></div>
                        {version.id === script.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="sentence-list">
            {script.sentences.map((sentence, index) => {
              const locked = sentence.status === 'locked'
              const tone = locked || sentence.status === 'pass' ? 'success' : sentence.status === 'improve' ? 'warning' : 'danger'
              return (
                <article className={`sentence-card status-${sentence.status}`} key={sentence.id}>
                  <div className="sentence-card__number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="sentence-card__content">
                    <textarea
                      value={sentence.text}
                      rows={Math.max(2, Math.ceil(sentence.text.length / 33))}
                      onChange={(e) => patchSentence(sentence.id, {
                        text: e.target.value,
                        status: locked ? 'locked' : 'improve',
                        estimatedSeconds: Math.max(1.2, Math.round((e.target.value.length / 4.1) * 10) / 10)
                      })}
                    />
                    <div className="sentence-card__meta">
                      <Tag tone="neutral">{roleLabels[sentence.role]}</Tag>
                      <span>{sentence.estimatedSeconds.toFixed(1)} 秒</span>
                      <button className="why-button" onClick={() => setExpanded(expanded === sentence.id ? null : sentence.id)}>
                        <MessageSquareText size={13} />为什么
                      </button>
                    </div>
                    {expanded === sentence.id && (
                      <div className="sentence-explanation">
                        <div><strong>关我何事检查</strong><Tag tone={tone}>{sentence.check.score} 分</Tag></div>
                        <p>{sentence.check.reason}</p>
                        <ul>
                          <li className={sentence.check.relatable ? 'yes' : 'no'}>{sentence.check.relatable ? <Check /> : <AlertCircle />}能否联想到自己的处境</li>
                          <li className={sentence.check.advances ? 'yes' : 'no'}>{sentence.check.advances ? <Check /> : <AlertCircle />}是否推动观点、故事或情绪</li>
                          <li className={!sentence.check.creatorCentric ? 'yes' : 'no'}>{!sentence.check.creatorCentric ? <Check /> : <AlertCircle />}是否避免无关的自我表达</li>
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="sentence-card__status">
                    <Tag tone={tone}>{locked ? '已锁定' : sentence.status === 'pass' ? '通过' : sentence.status === 'improve' ? '建议优化' : '未通过'}</Tag>
                    <button title={locked ? '解除锁定' : '锁定这句话'} onClick={() => patchSentence(sentence.id, { status: locked ? 'pass' : 'locked' })}>
                      {locked ? <Unlock size={15} /> : <Lock size={15} />}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <aside className="script-review">
          <Card className="review-score-card">
            <ScoreRing score={script.complianceScore} label="综合执行" />
            <div className="review-score-card__legend">
              <div><i className="green" /><span>通过</span><strong>{totals.pass}</strong></div>
              <div><i className="yellow" /><span>建议优化</span><strong>{totals.improve}</strong></div>
              <div><i className="red" /><span>未通过</span><strong>{totals.fail}</strong></div>
            </div>
          </Card>

          <Card className="compliance-card">
            <div className="panel-heading"><div><ShieldCheck size={17} /><h3>要求执行报告</h3></div></div>
            {project.understanding?.rules.filter((rule) => rule.enabled).slice(0, 7).map((rule, index) => (
              <div className="compliance-item" key={rule.id}>
                <span className={index < 5 ? 'is-pass' : 'is-review'}>{index < 5 ? <Check size={12} /> : <AlertCircle size={12} />}</span>
                <p>{rule.text}</p>
              </div>
            ))}
          </Card>

          {script.evaluation && (
            <Card className="creative-evaluation-card">
              <div className="panel-heading"><div><Sparkles size={17} /><h3>创作引擎评审</h3></div></div>
              {script.decisionReport && (
                <div className="candidate-decision">
                  <strong>{script.decisionReport.candidatesCompared} 稿内部比选 · {script.decisionReport.selectedStrategy}</strong>
                  <p>{script.decisionReport.selectionReason}</p>
                </div>
              )}
              <div className="evaluation-bars">
                {script.evaluation.scores.map((item) => (
                  <div key={item.dimension} title={item.reason}>
                    <span>{scoreLabels[item.dimension]}</span>
                    <i><b style={{ width: `${item.score}%` }} /></i>
                    <strong>{item.score}</strong>
                  </div>
                ))}
              </div>
              {script.evaluation.violations.length > 0 && (
                <div className="evaluation-risks">
                  <AlertCircle size={14} />
                  <span>{script.evaluation.violations[0]}</span>
                </div>
              )}
            </Card>
          )}

          <Button className="full-width" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void review()}>
            只修复未通过句子
          </Button>
          <div className="script-tip">
            <Sparkles size={16} />
            <span>锁定、改写和复盘都会形成你的偏好记忆；不会让模型自行改代码。</span>
          </div>
        </aside>
      </div>

      <div className="step-footer">
        <div><Sparkles size={17} /><span>下一步会把每个语义段匹配到口播、截图或辅助画面。</span></div>
        <Button size="lg" icon={<ChevronRight size={18} />} onClick={() => void generateStoryboard()}>文案满意，生成分镜</Button>
      </div>
    </div>
  )
}
