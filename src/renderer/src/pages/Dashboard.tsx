import {
  ArrowRight,
  Clock3,
  FileText,
  Film,
  MoreHorizontal,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserRound
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { CreativeMode, Project } from '../../../shared/types'
import { Button, Card, EmptyState, Tag } from '../components/Ui'
import { useStudioStore } from '../store'

const modeMeta: Record<CreativeMode, { label: string; tone: 'accent' | 'teal' | 'warning'; icon: typeof UserRound }> = {
  'personal-ip': { label: '个人IP', tone: 'accent', icon: UserRound },
  'new-media': { label: '新媒体', tone: 'teal', icon: Film },
  ecommerce: { label: '电商营销', tone: 'warning', icon: Target }
}

const stepLabels: Record<Project['step'], string> = {
  setup: '等待填写',
  understanding: '理解要求',
  blueprint: '创作蓝图',
  script: '文案创作',
  storyboard: '分镜成片',
  export: '已可导出'
}

function relativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

function ProjectCard({ project }: { project: Project }): ReactNode {
  const setActiveProject = useStudioStore((state) => state.setActiveProject)
  const deleteProject = useStudioStore((state) => state.deleteProject)
  const [menu, setMenu] = useState(false)
  const meta = modeMeta[project.mode]
  const Icon = meta.icon
  const progress = ['setup', 'understanding', 'blueprint', 'script', 'storyboard', 'export'].indexOf(project.step) + 1
  const hasPreview = project.assets.find((asset) => asset.uri && (asset.kind === 'screenshot' || asset.kind === 'image'))

  return (
    <article className="project-card" onDoubleClick={() => setActiveProject(project.id)}>
      <div className="project-card__preview">
        {hasPreview ? (
          <img src={hasPreview.uri} alt="" />
        ) : (
          <div className={`project-card__placeholder mode-${project.mode}`}>
            <Icon size={30} />
            <span>{project.topic || '等待你的想法'}</span>
          </div>
        )}
        <Tag tone={meta.tone}>{meta.label}</Tag>
        <div className="project-card__menu">
          <button onClick={(event) => { event.stopPropagation(); setMenu(!menu) }}><MoreHorizontal size={18} /></button>
          {menu && (
            <div className="menu-popover">
              <button onClick={() => setActiveProject(project.id)}><ArrowRight size={14} />打开项目</button>
              <button className="danger" onClick={() => deleteProject(project.id)}><Trash2 size={14} />删除项目</button>
            </div>
          )}
        </div>
      </div>
      <div className="project-card__body">
        <h3>{project.name}</h3>
        <p>{project.topic || project.coreViewpoint || '还没有填写本期主题'}</p>
        <div className="project-card__meta">
          <span><Clock3 size={14} />{relativeTime(project.updatedAt)}</span>
          <span>{project.durationTarget} 秒</span>
        </div>
        <div className="project-progress">
          <div>
            <span>{stepLabels[project.step]}</span>
            <strong>{progress}/6</strong>
          </div>
          <i><b style={{ width: `${(progress / 6) * 100}%` }} /></i>
        </div>
      </div>
    </article>
  )
}

export function Dashboard(): ReactNode {
  const data = useStudioStore((state) => state.data)
  const createProject = useStudioStore((state) => state.createProject)
  const [filter, setFilter] = useState<'all' | CreativeMode>('all')
  const projects = useMemo(
    () => (data?.projects ?? []).filter((project) => filter === 'all' || project.mode === filter),
    [data?.projects, filter]
  )
  const totalScripts = data?.projects.reduce((sum, project) => sum + project.scriptVersions.length, 0) ?? 0
  const readyProjects = data?.projects.filter((project) => project.storyboard.length > 0).length ?? 0

  return (
    <main className="page dashboard">
      <header className="page-header dashboard__header">
        <div>
          <div className="eyebrow"><Sparkles size={14} />今天也说点真正值得被听见的话</div>
          <h1>把想法，变成观众<br />愿意看完的内容。</h1>
          <p>先理解你的真实意图，再写文案、配画面、出粗剪。</p>
        </div>
        <Button size="lg" icon={<Plus size={19} />} onClick={createProject}>开始一次新创作</Button>
      </header>

      <section className="stat-grid">
        <Card className="stat-card">
          <div className="stat-card__icon orange"><Film size={20} /></div>
          <div><strong>{data?.projects.length ?? 0}</strong><span>创作项目</span></div>
          <em>本机安全保存</em>
        </Card>
        <Card className="stat-card">
          <div className="stat-card__icon violet"><FileText size={20} /></div>
          <div><strong>{totalScripts}</strong><span>文案版本</span></div>
          <em>修改不覆盖旧稿</em>
        </Card>
        <Card className="stat-card">
          <div className="stat-card__icon teal"><Target size={20} /></div>
          <div><strong>{readyProjects}</strong><span>可进入分镜</span></div>
          <em>素材优先自动匹配</em>
        </Card>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>最近项目</h2>
            <p>从上次停下的位置继续。</p>
          </div>
          <div className="segmented">
            {[
              ['all', '全部'],
              ['personal-ip', '个人IP'],
              ['new-media', '新媒体'],
              ['ecommerce', '电商']
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'is-active' : ''}
                onClick={() => setFilter(value as 'all' | CreativeMode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
            <button className="project-card project-card--new" onClick={createProject}>
              <span><Plus size={25} /></span>
              <strong>新建创作</strong>
              <small>从主题、素材或一个对标开始</small>
            </button>
          </div>
        ) : (
          <EmptyState
            icon={<Film size={30} />}
            title="还没有这个类型的项目"
            description="从一个真实想法开始，软件会带你走完整个流程。"
            action={<Button icon={<Plus size={17} />} onClick={createProject}>新建第一个项目</Button>}
          />
        )}
      </section>
    </main>
  )
}

