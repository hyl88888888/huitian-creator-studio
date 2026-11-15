import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Check,
  CheckCircle2,
  FileJson2,
  FileSpreadsheet,
  FileVideo2,
  FolderOpen,
  Layers3,
  PackageOpen,
  Sparkles
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { RenderProgress } from '../../../shared/types'
import { Button, Card, Tag } from '../components/Ui'
import { useStudioStore } from '../store'
import type { StepProps } from './types'

const deliverables = [
  { icon: FileVideo2, name: '成片预览 MP4', description: '便于快速查看整体效果' },
  { icon: Layers3, name: '无硬字幕粗剪', description: '适合进入剪映继续包装' },
  { icon: Captions, name: '可编辑字幕 SRT', description: '导入后每句可单独修改' },
  { icon: PackageOpen, name: '编号镜头素材', description: '按 001、002…整理' },
  { icon: FileSpreadsheet, name: '镜头清单 CSV', description: '起止时间、画面和动效说明' },
  { icon: FileJson2, name: '本软件时间线 JSON', description: '完整保留项目结构' }
]

export function ExportStep({ project, update, go }: StepProps): ReactNode {
  const defaultDirectory = useStudioStore((state) => state.data?.settings.defaultExportDirectory)
  const setNotice = useStudioStore((state) => state.setNotice)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<RenderProgress | null>(null)

  useEffect(() => window.studio.onRenderProgress((next) => {
    if (next.projectId === project.id) setProgress(next)
  }), [project.id])

  const startExport = async (): Promise<void> => {
    setExporting(true)
    setProgress({ projectId: project.id, phase: 'start', progress: 2, message: '正在准备导出…' })
    try {
      const result = await window.studio.exportProject({
        project,
        destination: defaultDirectory || undefined,
        includePreview: true,
        includeCleanRoughCut: true
      })
      update({ exportResult: result })
      setNotice({ type: 'success', message: '导出完成，剪映友好素材包已经准备好。' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('取消')) setNotice({ type: 'error', message })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="studio-step export-step">
      <div className="step-intro step-intro--with-action">
        <div><span>06</span><div><h2>一份成片，一份可以继续改的交付包</h2><p>不把结果锁死在扁平视频里，字幕、镜头和时间线都单独保留。</p></div></div>
        <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => go('storyboard')}>返回分镜</Button>
      </div>

      <div className="export-layout">
        <Card className="export-preview-card">
          <div className="export-cover">
            {project.assets.find((asset) => asset.mimeType.startsWith('image/')) ? (
              <img src={project.assets.find((asset) => asset.mimeType.startsWith('image/'))?.uri} alt="" />
            ) : (
              <div><Sparkles size={38} /><span>{project.topic || project.name}</span></div>
            )}
            <i>9:16</i>
          </div>
          <div className="export-preview-card__body">
            <Tag tone="accent">{project.mode === 'personal-ip' ? '个人IP' : project.mode === 'new-media' ? '新媒体' : '电商营销'}</Tag>
            <h3>{project.name}</h3>
            <p>{project.topic}</p>
            <div><span>{project.storyboard.length} 个镜头</span><span>约 {Math.round(project.storyboard.reduce((sum, shot) => sum + shot.duration, 0))} 秒</span><span>1080 × 1920</span></div>
          </div>
        </Card>

        <div className="export-main">
          <Card className="deliverables-card">
            <div className="form-section__heading"><div><h3>将要导出的内容</h3><p>所有内容都在本机生成并保存。</p></div><Tag tone="success">剪映友好</Tag></div>
            <div className="deliverable-list">
              {deliverables.map((item) => {
                const Icon = item.icon
                return <div key={item.name}><span><Icon size={18} /></span><div><strong>{item.name}</strong><small>{item.description}</small></div><Check size={16} /></div>
              })}
            </div>
          </Card>

          <div className="jianying-note">
            <AlertTriangle size={19} />
            <div>
              <strong>关于剪映工程</strong>
              <p>当前稳定交付是“剪映友好素材包”，不是剪映原生草稿。自动创建剪映草稿需要官方接口或逐版本兼容，后续只会作为 Beta 提供。</p>
            </div>
          </div>

          {(exporting || progress) && (
            <Card className={`export-progress ${progress?.progress === 100 ? 'is-done' : ''}`}>
              <div>
                {progress?.progress === 100 ? <CheckCircle2 size={21} /> : <PackageOpen size={21} />}
                <div><strong>{progress?.progress === 100 ? '导出完成' : '正在本地处理'}</strong><span>{progress?.message}</span></div>
                <em>{progress?.progress ?? 0}%</em>
              </div>
              <i><b style={{ width: `${progress?.progress ?? 0}%` }} /></i>
            </Card>
          )}

          {project.exportResult && (
            <Card className="export-result-card">
              <div><CheckCircle2 size={22} /><div><strong>最近一次导出</strong><span>{project.exportResult.directory}</span></div></div>
              {project.exportResult.warnings.map((warning) => <p key={warning}><AlertTriangle size={14} />{warning}</p>)}
              <Button variant="secondary" icon={<FolderOpen size={17} />} onClick={() => void window.studio.revealPath(project.exportResult!.directory)}>打开导出文件夹</Button>
            </Card>
          )}

          <div className="export-actions">
            <div><FolderOpen size={17} /><span>{defaultDirectory || '导出时选择保存位置'}</span></div>
            <Button size="lg" loading={exporting} icon={<PackageOpen size={18} />} onClick={() => void startExport()}>
              生成成片与剪映素材包
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

