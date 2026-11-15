import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Heart,
  Lock,
  Sparkles,
  Target,
  Unlock,
  UsersRound
} from 'lucide-react'
import { type ReactNode } from 'react'
import type { BlueprintSection, CreativeBlueprint, Project } from '../../../shared/types'
import { Button, Card, Field, TextArea, TextInput } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

export function BlueprintStep({ project, profile, update, go }: StepProps): ReactNode {
  const blueprint = project.blueprint
  const setBusy = useStudioStore((state) => state.setBusy)
  const setNotice = useStudioStore((state) => state.setNotice)
  if (!blueprint) return null

  const patch = (next: Partial<CreativeBlueprint>): void => update({ blueprint: { ...blueprint, ...next } })
  const patchSection = (id: string, next: Partial<BlueprintSection>): void => patch({
    sections: blueprint.sections.map((section) => section.id === id ? { ...section, ...next } : section)
  })
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= blueprint.sections.length) return
    const sections = [...blueprint.sections]
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    patch({ sections })
  }
  const generateScript = async (): Promise<void> => {
    setBusy('正在按照蓝图写文案，并逐句运行“关我何事”检查…')
    try {
      const confirmed = { ...blueprint, confirmed: true }
      const nextProject = { ...project, blueprint: confirmed }
      const script = await window.studio.runAiTask<Project['scriptVersions'][number]>({
        task: 'script',
        project: nextProject,
        profile
      })
      update({
        blueprint: confirmed,
        scriptVersions: [...project.scriptVersions, script],
        activeScriptId: script.id,
        step: 'script'
      })
      go('script')
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="studio-step blueprint-step">
      <div className="step-intro step-intro--with-action">
        <div><span>03</span><div><h2>先定结构，再开始写正文</h2><p>避免一上来生成整篇，方向不对时只能全部推翻。</p></div></div>
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => go('understanding')}>返回理解要求</Button>
      </div>

      <div className="blueprint-summary">
        <Card><div className="summary-icon orange"><UsersRound size={19} /></div><span>核心观众</span><TextArea rows={3} value={blueprint.coreAudience} onChange={(e) => patch({ coreAudience: e.target.value })} /></Card>
        <Card><div className="summary-icon teal"><Heart size={19} /></div><span>观众张力</span><TextArea rows={3} value={blueprint.audienceTension} onChange={(e) => patch({ audienceTension: e.target.value })} /></Card>
        <Card><div className="summary-icon violet"><Target size={19} /></div><span>一句话核心观点</span><TextArea rows={3} value={blueprint.coreThesis} onChange={(e) => patch({ coreThesis: e.target.value })} /></Card>
      </div>

      <Card className="blueprint-flow">
        <div className="form-section__heading">
          <div><h3>内容结构</h3><p>拖动思路的本质是调整观众的理解顺序。已锁定的卡片不会被后续重做覆盖。</p></div>
        </div>
        <div className="flow-line" />
        <div className="section-card-list">
          {blueprint.sections.map((section, index) => (
            <article className={`blueprint-section-card ${section.locked ? 'is-locked' : ''}`} key={section.id}>
              <div className="blueprint-section-card__number">{String(index + 1).padStart(2, '0')}</div>
              <div className="blueprint-section-card__body">
                <div className="blueprint-section-card__title">
                  <TextInput value={section.title} onChange={(e) => patchSection(section.id, { title: e.target.value })} />
                  <span>{section.purpose}</span>
                </div>
                <TextArea rows={2} value={section.content} onChange={(e) => patchSection(section.id, { content: e.target.value })} />
                <div className="audience-link"><Heart size={13} /><span>与观众的关系：</span><input value={section.audienceLink} onChange={(e) => patchSection(section.id, { audienceLink: e.target.value })} /></div>
              </div>
              <div className="blueprint-section-card__actions">
                <button onClick={() => patchSection(section.id, { locked: !section.locked })}>{section.locked ? <Lock size={15} /> : <Unlock size={15} />}</button>
                <button disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                <button disabled={index === blueprint.sections.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <div className="blueprint-bottom">
        <Card>
          <Field label="开头钩子"><TextArea rows={3} value={blueprint.hook} onChange={(e) => patch({ hook: e.target.value })} /></Field>
          <Field label="情绪曲线"><TextInput value={blueprint.emotionalArc} onChange={(e) => patch({ emotionalArc: e.target.value })} /></Field>
        </Card>
        <Card>
          <Field label="结尾与行动"><TextArea rows={3} value={blueprint.cta} onChange={(e) => patch({ cta: e.target.value })} /></Field>
          <Field label="视觉方向"><TextInput value={blueprint.visualDirection} onChange={(e) => patch({ visualDirection: e.target.value })} /></Field>
        </Card>
      </div>

      <div className="step-footer">
        <div><Sparkles size={17} /><span>下一步会逐句标记关联性、事实依据和预计口播时长。</span></div>
        <Button size="lg" icon={<ChevronRight size={18} />} onClick={() => void generateScript()}>确认蓝图并写文案</Button>
      </div>
    </div>
  )
}
