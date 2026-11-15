import {
  ArrowLeft,
  Check,
  Circle,
  Cloud,
  FileText,
  Layers3,
  Lightbulb,
  PackageOpen,
  PencilRuler,
  Save,
  Sparkles
} from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { ProjectStep } from '../../../shared/types'
import { Button } from '../components/Ui'
import { useStudioStore } from '../store'
import { BlueprintStep } from './BlueprintStep'
import { ExportStep } from './ExportStep'
import { ScriptStep } from './ScriptStep'
import { SetupStep } from './SetupStep'
import { StoryboardStep } from './StoryboardStep'
import { UnderstandingStep } from './UnderstandingStep'

const steps: Array<{ id: ProjectStep; label: string; icon: typeof Lightbulb }> = [
  { id: 'setup', label: '创建项目', icon: PencilRuler },
  { id: 'understanding', label: '理解要求', icon: Sparkles },
  { id: 'blueprint', label: '创作蓝图', icon: Lightbulb },
  { id: 'script', label: '文案', icon: FileText },
  { id: 'storyboard', label: '分镜成片', icon: Layers3 },
  { id: 'export', label: '导出', icon: PackageOpen }
]

export function ProjectStudio(): ReactNode {
  const data = useStudioStore((state) => state.data)
  const activeId = useStudioStore((state) => state.activeProjectId)
  const setActiveProject = useStudioStore((state) => state.setActiveProject)
  const updateProject = useStudioStore((state) => state.updateProject)
  const saveNow = useStudioStore((state) => state.saveNow)
  const setNotice = useStudioStore((state) => state.setNotice)
  const project = data?.projects.find((item) => item.id === activeId)
  const profile = useMemo(() => data?.profiles.find((item) => item.id === project?.profileId), [data?.profiles, project?.profileId])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [project?.step])

  if (!project) return null

  const currentIndex = steps.findIndex((step) => step.id === project.step)
  const go = (step: ProjectStep): void => updateProject(project.id, { step })
  const update = (patch: Parameters<typeof updateProject>[1]): void => updateProject(project.id, patch)
  const save = async (): Promise<void> => {
    await saveNow()
    setNotice({ type: 'success', message: '项目已保存在本机。' })
  }

  return (
    <main className="studio-page">
      <header className="studio-header">
        <div className="studio-header__title">
          <button onClick={() => setActiveProject(null)}><ArrowLeft size={18} /></button>
          <div><h1>{project.name}</h1><span><Cloud size={13} />本机自动保存 · {project.durationTarget}秒 · 9:16</span></div>
        </div>
        <div className="studio-header__actions">
          <Button variant="ghost" size="sm" icon={<Save size={15} />} onClick={() => void save()}>立即保存</Button>
        </div>
      </header>

      <div className="stepper">
        {steps.map((step, index) => {
          const Icon = step.icon
          const completed = index < currentIndex
          const active = step.id === project.step
          const accessible = index <= currentIndex || (
            step.id === 'understanding' ? Boolean(project.understanding) :
              step.id === 'blueprint' ? Boolean(project.blueprint) :
                step.id === 'script' ? project.scriptVersions.length > 0 :
                  step.id === 'storyboard' || step.id === 'export' ? project.storyboard.length > 0 : true
          )
          return (
            <button
              key={step.id}
              className={`${active ? 'is-active' : ''} ${completed ? 'is-complete' : ''}`}
              disabled={!accessible}
              onClick={() => accessible && go(step.id)}
            >
              <span>{completed ? <Check size={14} /> : active ? <Icon size={15} /> : <Circle size={12} />}</span>
              <strong>{step.label}</strong>
              {index < steps.length - 1 && <i />}
            </button>
          )
        })}
      </div>

      <div className="studio-scroll" ref={scrollRef}>
        {project.step === 'setup' && <SetupStep project={project} profile={profile} update={update} go={go} />}
        {project.step === 'understanding' && <UnderstandingStep project={project} profile={profile} update={update} go={go} />}
        {project.step === 'blueprint' && <BlueprintStep project={project} profile={profile} update={update} go={go} />}
        {project.step === 'script' && <ScriptStep project={project} profile={profile} update={update} go={go} />}
        {project.step === 'storyboard' && <StoryboardStep project={project} profile={profile} update={update} go={go} />}
        {project.step === 'export' && <ExportStep project={project} profile={profile} update={update} go={go} />}
      </div>
    </main>
  )
}
