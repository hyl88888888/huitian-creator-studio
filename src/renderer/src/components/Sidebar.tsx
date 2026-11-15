import {
  FolderKanban,
  Images,
  Settings,
  Sparkles,
  UserRound,
  WandSparkles
} from 'lucide-react'
import type { ReactNode } from 'react'
import appIcon from '../assets/app-icon.png'
import { useStudioStore, type AppView } from '../store'

const items: Array<{ id: AppView; label: string; icon: typeof FolderKanban }> = [
  { id: 'projects', label: '创作项目', icon: FolderKanban },
  { id: 'profiles', label: 'IP / 品牌档案', icon: UserRound },
  { id: 'assets', label: '素材库', icon: Images },
  { id: 'styles', label: '风格模板', icon: WandSparkles },
  { id: 'settings', label: '设置', icon: Settings }
]

export function Sidebar(): ReactNode {
  const view = useStudioStore((state) => state.view)
  const data = useStudioStore((state) => state.data)
  const setView = useStudioStore((state) => state.setView)
  const setActiveProject = useStudioStore((state) => state.setActiveProject)
  const aiReady = Boolean(data?.settings.ai.enabled && data.settings.ai.model && data.settings.ai.apiKey)

  const navigate = (next: AppView): void => {
    setActiveProject(null)
    setView(next)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">
          <img src={appIcon} alt="" />
        </div>
        <div>
          <strong>回天创作台</strong>
          <span>AI CONTENT STUDIO</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__caption">工作空间</div>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`sidebar__item ${view === item.id ? 'is-active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar__footer">
        <div className={`engine-state ${aiReady ? 'is-online' : ''}`}>
          <div className="engine-state__icon"><Sparkles size={17} /></div>
          <div>
            <strong>{aiReady ? '回天高级创作已连接' : '本地基础模式'}</strong>
            <span>{aiReady ? data?.settings.ai.model : '结构、规则与导出可用'}</span>
          </div>
          <i />
        </div>
        {!aiReady && (
          <button className="sidebar__setup" onClick={() => navigate('settings')}>
            <Settings size={14} />
            配置模型服务
          </button>
        )}
      </div>
    </aside>
  )
}
