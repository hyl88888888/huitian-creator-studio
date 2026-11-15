import { Plus, Save, Trash2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { IpProfile } from '../../../shared/types'
import { Button, Card, EmptyState, Field, TextArea, TextInput } from '../components/Ui'
import { useStudioStore } from '../store'

function blankProfile(): IpProfile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '新的IP档案',
    identity: '',
    audience: '',
    beliefs: '',
    voice: '',
    experiences: '',
    preferredPhrases: '',
    forbiddenPhrases: '',
    visualStyle: '',
    createdAt: now,
    updatedAt: now
  }
}

export function ProfilesPage(): ReactNode {
  const profiles = useStudioStore((state) => state.data?.profiles ?? [])
  const upsert = useStudioStore((state) => state.upsertProfile)
  const remove = useStudioStore((state) => state.deleteProfile)
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? '')
  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId), [profiles, selectedId])
  const [draft, setDraft] = useState<IpProfile | null>(selected ?? null)

  useEffect(() => setDraft(selected ?? null), [selected])

  const create = (): void => {
    const profile = blankProfile()
    upsert(profile)
    setSelectedId(profile.id)
  }

  const update = (patch: Partial<IpProfile>): void => {
    setDraft((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current)
  }

  const save = (): void => {
    if (draft) upsert(draft)
  }

  return (
    <main className="page profiles-page">
      <header className="page-header page-header--compact">
        <div>
          <div className="eyebrow"><UserRound size={14} />长期记忆</div>
          <h1>IP / 品牌档案</h1>
          <p>把你是谁、相信什么、如何表达保存一次，以后每条内容都会从这里出发。</p>
        </div>
        <Button icon={<Plus size={18} />} onClick={create}>新建档案</Button>
      </header>

      <div className="master-detail">
        <aside className="master-list">
          <div className="master-list__title">
            <span>档案</span>
            <small>{profiles.length}</small>
          </div>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className={selectedId === profile.id ? 'is-active' : ''}
              onClick={() => setSelectedId(profile.id)}
            >
              <span className="avatar">{profile.name.slice(0, 1)}</span>
              <div><strong>{profile.name}</strong><small>{profile.identity || '等待补充身份定位'}</small></div>
            </button>
          ))}
        </aside>

        {draft ? (
          <Card className="profile-editor">
            <div className="profile-editor__top">
              <div>
                <span className="avatar avatar--large">{draft.name.slice(0, 1)}</span>
                <div><h2>{draft.name}</h2><p>内容会优先继承这份档案中的真实信息。</p></div>
              </div>
              <div className="button-row">
                {profiles.length > 1 && (
                  <Button
                    variant="ghost"
                    icon={<Trash2 size={16} />}
                    onClick={() => {
                      remove(draft.id)
                      setSelectedId(profiles.find((profile) => profile.id !== draft.id)?.id ?? '')
                    }}
                  >
                    删除
                  </Button>
                )}
                <Button icon={<Save size={17} />} onClick={save}>保存档案</Button>
              </div>
            </div>

            <div className="form-grid form-grid--2">
              <Field label="档案名称"><TextInput value={draft.name} onChange={(e) => update({ name: e.target.value })} /></Field>
              <Field label="你是谁 / 账号定位"><TextInput placeholder="例如：帮助普通人把复杂问题讲明白的内容创作者" value={draft.identity} onChange={(e) => update({ identity: e.target.value })} /></Field>
              <Field label="核心观众"><TextArea rows={3} placeholder="他们是谁，正处在什么阶段？" value={draft.audience} onChange={(e) => update({ audience: e.target.value })} /></Field>
              <Field label="核心观点与价值观"><TextArea rows={3} placeholder="你长期相信什么？反对什么？" value={draft.beliefs} onChange={(e) => update({ beliefs: e.target.value })} /></Field>
              <Field label="表达气质"><TextArea rows={3} placeholder="例如：真诚、克制、有锋芒，不说教" value={draft.voice} onChange={(e) => update({ voice: e.target.value })} /></Field>
              <Field label="真实经历与案例"><TextArea rows={3} placeholder="可以被后续内容引用的真实经验" value={draft.experiences} onChange={(e) => update({ experiences: e.target.value })} /></Field>
              <Field label="喜欢的表达"><TextArea rows={3} placeholder="常用句式、口头禅、满意文案片段" value={draft.preferredPhrases} onChange={(e) => update({ preferredPhrases: e.target.value })} /></Field>
              <Field label="禁止的表达"><TextArea rows={3} placeholder="不喜欢的套话、绝不使用的说法" value={draft.forbiddenPhrases} onChange={(e) => update({ forbiddenPhrases: e.target.value })} /></Field>
              <Field label="视觉风格" className="span-2"><TextArea rows={3} placeholder="人物构图、字幕、色彩、动效强度和截图习惯" value={draft.visualStyle} onChange={(e) => update({ visualStyle: e.target.value })} /></Field>
            </div>
          </Card>
        ) : (
          <EmptyState icon={<UserRound size={30} />} title="建立你的第一份IP档案" description="软件需要真实材料，才能避免写出千篇一律的AI文案。" action={<Button onClick={create}>新建档案</Button>} />
        )}
      </div>
    </main>
  )
}

