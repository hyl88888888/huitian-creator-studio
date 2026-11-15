import { CheckCircle2, LoaderCircle, Sparkles, X, XCircle } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { LibraryPage } from './pages/LibraryPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { SettingsPage } from './pages/SettingsPage'
import { StylesPage } from './pages/StylesPage'
import { ProjectStudio } from './studio/ProjectStudio'
import { useStudioStore } from './store'

function Content(): ReactNode {
  const view = useStudioStore((state) => state.view)
  if (view === 'project') return <ProjectStudio />
  if (view === 'profiles') return <ProfilesPage />
  if (view === 'assets') return <LibraryPage />
  if (view === 'styles') return <StylesPage />
  if (view === 'settings') return <SettingsPage />
  return <Dashboard />
}

export default function App(): ReactNode {
  const data = useStudioStore((state) => state.data)
  const loaded = useStudioStore((state) => state.loaded)
  const initialize = useStudioStore((state) => state.initialize)
  const busyLabel = useStudioStore((state) => state.busyLabel)
  const notice = useStudioStore((state) => state.notice)
  const setNotice = useStudioStore((state) => state.setNotice)
  const saveNow = useStudioStore((state) => state.saveNow)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (!loaded || !data?.settings.autoSave) return
    const timer = window.setTimeout(() => {
      void saveNow()
    }, 800)
    return () => window.clearTimeout(timer)
  }, [data, loaded, saveNow])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice, setNotice])

  useEffect(() => window.studio.onAiFallback((reason) => {
    const conciseReason = reason.length > 110 ? `${reason.slice(0, 110)}…` : reason
    setNotice({
      type: 'info',
      message: `模型服务暂时不可用，本次已由本地引擎完成。原因：${conciseReason}`
    })
  }), [setNotice])

  if (!loaded) {
    return (
      <div className="launch-screen">
        <div className="launch-screen__mark"><Sparkles size={28} /></div>
        <h1>回天创作台</h1>
        <p>正在打开你的本地工作空间…</p>
        <LoaderCircle className="spin" size={22} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content"><Content /></div>

      {busyLabel && (
        <div className="busy-overlay">
          <div className="busy-card">
            <div className="busy-orbit"><span /><i /><b /><Sparkles size={23} /></div>
            <h3>{busyLabel}</h3>
            <p>软件会先检查你的要求，再进入下一步。</p>
          </div>
        </div>
      )}

      {notice && (
        <div className={`toast toast--${notice.type}`}>
          {notice.type === 'success' ? <CheckCircle2 size={19} /> : notice.type === 'error' ? <XCircle size={19} /> : <Sparkles size={19} />}
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}
    </div>
  )
}
