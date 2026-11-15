import { Check, Sparkles, WandSparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { VisualPreset } from '../../../shared/types'
import { Card, Tag } from '../components/Ui'
import { useStudioStore } from '../store'

const styles: Array<{ id: VisualPreset; name: string; label: string; description: string; color: string; effects: string[] }> = [
  { id: 'dense-light', name: '高密度浅色', label: '新项目默认', description: '融合导演先理解每句话的任务，再从七类方法中选择一个主方法和最多两个辅助方法，统一成回天自己的浅色画面。', color: '#ff6a2b', effects: ['逐句语义导演', '多家技法融合', '浅色原创模板'] },
  { id: 'authentic', name: '真实口播', label: '个人IP默认', description: '人物是主体，轻推近、自然字幕，截图只在需要证明时出现。', color: '#ff7a1a', effects: ['轻微推拉', '关键词强调', '截图标注'] },
  { id: 'knowledge', name: '知识解释', label: '清晰理性', description: '信息层级明确，用图形、卡片和分屏帮助观众快速理解。', color: '#58c9bd', effects: ['概念卡片', '画中画', '步骤动效'] },
  { id: 'emotion', name: '情绪观点', label: '有张力', description: '克制的光影和构图变化，重点服务情绪转折与金句。', color: '#ad7cff', effects: ['慢推近', '金句卡', '节奏留白'] },
  { id: 'proof', name: '截图举证', label: '可信具体', description: '聊天记录、数据和录屏成为证据，自动高亮对应区域。', color: '#4e8cff', effects: ['截图推近', '重点框选', '局部遮罩'] },
  { id: 'minimal', name: '高级简约', label: '品牌感', description: '大量留白、统一字体与低密度动效，保持画面呼吸感。', color: '#d7d3c8', effects: ['柔和叠化', '低饱和', '精简字幕'] }
]

export function StylesPage(): ReactNode {
  const selected = useStudioStore((state) => state.data?.settings.defaultVisualPreset ?? 'dense-light')
  const updateData = useStudioStore((state) => state.updateData)
  const selectStyle = (id: VisualPreset): void => updateData((data) => ({
    ...data,
    settings: { ...data.settings, defaultVisualPreset: id }
  }))
  return (
    <main className="page">
      <header className="page-header page-header--compact">
        <div>
          <div className="eyebrow"><WandSparkles size={14} />视觉语言</div>
          <h1>风格模板</h1>
          <p>模板不是随机堆特效，而是一组稳定的构图、字幕、节奏和动效规则。</p>
        </div>
      </header>

      <div className="style-grid">
        {styles.map((style, index) => (
          <Card
            key={style.id}
            interactive
            className={`style-card ${selected === style.id ? 'is-selected' : ''}`}
          >
            <button onClick={() => selectStyle(style.id)}>
              <div className="style-card__visual" style={{ '--style-color': style.color } as React.CSSProperties}>
                <div className="style-card__phone">
                  <i />
                  <span>{index % 2 === 0 ? '真正影响你的，往往不是表面的问题' : '把复杂的事，讲到人心里'}</span>
                  <b />
                </div>
                {selected === style.id && <em><Check size={15} /></em>}
              </div>
              <div className="style-card__body">
                <div><h3>{style.name}</h3><Tag tone={selected === style.id ? 'accent' : 'neutral'}>{style.label}</Tag></div>
                <p>{style.description}</p>
                <div className="style-card__effects">
                  {style.effects.map((effect) => <span key={effect}>{effect}</span>)}
                </div>
              </div>
            </button>
          </Card>
        ))}
      </div>

      <div className="info-banner">
        <Sparkles size={20} />
        <div>
          <strong>已将“高密度浅色”设为新项目默认</strong>
          <span>不会把整条视频套成某一个博主的样子。每句话都按表达任务选主方法与辅助方法，集众家之所长，再用统一字体、配色、字幕和节奏变成你的原创视觉语言。</span>
        </div>
      </div>
    </main>
  )
}
