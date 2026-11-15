import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  MessageCircleQuestion,
  Pencil,
  Sparkles,
  X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CreativeRule, Project, RequirementUnderstanding } from '../../../shared/types'
import { Button, Card, Tag, TextArea } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

const categoryLabels: Record<CreativeRule['category'], string> = {
  hard: '必须执行',
  effect: '表达效果',
  reference: '对标学习',
  avoid: '不应模仿',
  inferred: '系统推断'
}

function RuleGroup({
  category,
  rules,
  onChange
}: {
  category: CreativeRule['category']
  rules: CreativeRule[]
  onChange: (id: string, patch: Partial<CreativeRule>) => void
}): ReactNode {
  if (!rules.length) return null
  return (
    <div className="rule-group">
      <h4>{categoryLabels[category]}<span>{rules.length}</span></h4>
      {rules.map((rule) => (
        <div className={`rule-item ${rule.enabled ? '' : 'is-disabled'}`} key={rule.id}>
          <button className={`check-toggle ${rule.enabled ? 'is-checked' : ''}`} onClick={() => onChange(rule.id, { enabled: !rule.enabled })}>
            {rule.enabled && <Check size={12} />}
          </button>
          <textarea value={rule.text} onChange={(e) => onChange(rule.id, { text: e.target.value })} rows={Math.max(1, Math.ceil(rule.text.length / 34))} />
          <div className="rule-item__meta">
            <button onClick={() => onChange(rule.id, { priority: rule.priority === 'must' ? 'prefer' : 'must' })}>
              <Tag tone={rule.priority === 'must' ? 'accent' : 'neutral'}>{rule.priority === 'must' ? '必须' : '尽量'}</Tag>
            </button>
            <span>{rule.source === 'user' ? '来自用户原话' : rule.source === 'profile' ? '来自IP档案' : rule.source === 'reference' ? '来自对标' : '系统补充'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function UnderstandingStep({ project, profile, update, go }: StepProps): ReactNode {
  const understanding = project.understanding
  const setBusy = useStudioStore((state) => state.setBusy)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [editingSummary, setEditingSummary] = useState(false)
  if (!understanding) return null

  const patchUnderstanding = (patch: Partial<RequirementUnderstanding>): void => update({ understanding: { ...understanding, ...patch } })
  const patchRule = (id: string, patch: Partial<CreativeRule>): void => patchUnderstanding({
    rules: understanding.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule)
  })

  const confirm = async (): Promise<void> => {
    setBusy('正在把确认后的规则变成创作蓝图…')
    try {
      const confirmed = { ...understanding, confirmed: true }
      const nextProject = { ...project, understanding: confirmed }
      const blueprint = await window.studio.runAiTask<Project['blueprint']>({
        task: 'blueprint',
        project: nextProject,
        profile
      })
      update({ understanding: confirmed, blueprint, step: 'blueprint' })
      go('blueprint')
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="studio-step understanding-step">
      <div className="step-intro step-intro--with-action">
        <div><span>02</span><div><h2>先确认：软件有没有真正听懂</h2><p>这份“语义契约”会约束后续文案与分镜，确认前可以直接修改。</p></div></div>
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => go('setup')}>返回修改原始要求</Button>
      </div>

      <div className="understanding-grid">
        <Card className="source-panel">
          <div className="panel-heading"><div><Eye size={17} /><h3>你的原始输入</h3></div><Tag>只读</Tag></div>
          <div className="source-block"><span>本期主题</span><p>{project.topic || project.coreViewpoint || project.productName}</p></div>
          <div className="source-block"><span>目标观众</span><p>{project.audience || profile?.audience || '未明确'}</p></div>
          <div className="source-block source-block--large"><span>具体要求</span><p>{project.requirements || '未填写'}</p></div>
          {profile && (
            <div className="profile-source">
              <div className="avatar">{profile.name.slice(0, 1)}</div>
              <div><strong>{profile.name}</strong><span>{profile.voice || '未设置表达气质'}</span></div>
            </div>
          )}
        </Card>

        <Card className="interpretation-panel">
          <div className="panel-heading">
            <div><Sparkles size={17} /><h3>我对你的理解</h3></div>
            <button onClick={() => setEditingSummary(!editingSummary)}><Pencil size={15} />{editingSummary ? '完成' : '编辑'}</button>
          </div>
          {editingSummary ? (
            <TextArea rows={6} value={understanding.summary} onChange={(e) => patchUnderstanding({ summary: e.target.value })} />
          ) : (
            <blockquote>“{understanding.summary}”</blockquote>
          )}
          <div className="audience-state">
            <span>观众此刻的状态</span>
            <p>{understanding.audienceState}</p>
            <div>{understanding.humanDrivers.map((driver) => <Tag key={driver} tone="teal">{driver}</Tag>)}</div>
          </div>

          <div className="rules-scroll">
            {(['hard', 'effect', 'reference', 'avoid', 'inferred'] as CreativeRule['category'][]).map((category) => (
              <RuleGroup
                key={category}
                category={category}
                rules={understanding.rules.filter((rule) => rule.category === category)}
                onChange={patchRule}
              />
            ))}
          </div>
        </Card>

        <div className="review-side">
          <Card className="issues-panel">
            <div className="panel-heading"><div><AlertTriangle size={17} /><h3>冲突与缺失</h3></div></div>
            {understanding.conflicts.length === 0 && understanding.missing.length === 0 ? (
              <div className="all-clear"><Check size={18} /><div><strong>没有明显冲突</strong><span>可以继续生成创作蓝图</span></div></div>
            ) : (
              <>
                {understanding.conflicts.map((item) => <div className="issue issue--danger" key={item}><X size={15} /><span>{item}</span></div>)}
                {understanding.missing.map((item) => <div className="issue" key={item}><CircleHelp size={15} /><span>{item}</span></div>)}
              </>
            )}
          </Card>

          {understanding.interviewQuestions.length > 0 && (
            <Card className="interview-panel">
              <div className="panel-heading"><div><MessageCircleQuestion size={17} /><h3>深度采访</h3></div><Tag tone="accent">让文案更独特</Tag></div>
              <p className="panel-description">回答越具体，越能写出只属于你的内容；也可以留空。</p>
              <div className="interview-list">
                {understanding.interviewQuestions.map((item, index) => (
                  <label key={item.id}>
                    <span>{String(index + 1).padStart(2, '0')} · {item.question}</span>
                    <textarea
                      rows={2}
                      placeholder="写一个真实细节…"
                      value={item.answer}
                      onChange={(e) => patchUnderstanding({
                        interviewQuestions: understanding.interviewQuestions.map((question) => question.id === item.id ? { ...question, answer: e.target.value } : question)
                      })}
                    />
                  </label>
                ))}
              </div>
            </Card>
          )}

          <Button size="lg" className="full-width" icon={<ChevronRight size={18} />} onClick={() => void confirm()}>
            确认理解，生成创作蓝图
          </Button>
        </div>
      </div>
    </div>
  )
}
