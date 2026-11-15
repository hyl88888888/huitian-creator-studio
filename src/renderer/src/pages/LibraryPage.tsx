import { Film, Image as ImageIcon, Images, Mic2, MonitorPlay } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Card, EmptyState, Tag } from '../components/Ui'
import { useStudioStore } from '../store'

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function LibraryPage(): ReactNode {
  const projects = useStudioStore((state) => state.data?.projects ?? [])
  const assets = useMemo(
    () => projects.flatMap((project) => project.assets.map((asset) => ({ asset, project }))),
    [projects]
  )

  return (
    <main className="page">
      <header className="page-header page-header--compact">
        <div>
          <div className="eyebrow"><Images size={14} />本地素材</div>
          <h1>素材库</h1>
          <p>这里汇总项目中使用过的口播、截图、录屏和辅助画面，文件仍保留在你的电脑。</p>
        </div>
      </header>

      {assets.length ? (
        <div className="asset-library-grid">
          {assets.map(({ asset, project }) => {
            const isImage = asset.mimeType.startsWith('image/')
            const icon = asset.kind === 'talking-head' ? <Mic2 /> : asset.kind === 'screen-recording' ? <MonitorPlay /> : isImage ? <ImageIcon /> : <Film />
            return (
              <Card key={asset.id} className="asset-library-card">
                <div className="asset-library-card__media">
                  {isImage ? <img src={asset.uri} alt="" /> : <div>{icon}</div>}
                  <Tag tone={asset.status === 'ready' ? 'success' : 'warning'}>{asset.status === 'ready' ? '可用' : '待检查'}</Tag>
                </div>
                <div className="asset-library-card__body">
                  <strong title={asset.name}>{asset.name}</strong>
                  <span>{project.name}</span>
                  <small>{formatBytes(asset.size)}{asset.duration ? ` · ${asset.duration.toFixed(1)} 秒` : ''}</small>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<Images size={30} />} title="还没有素材" description="在创作项目中上传口播、截图、图片或视频后，它们会出现在这里。" />
      )}
    </main>
  )
}

