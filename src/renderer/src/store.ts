import { create } from 'zustand'
import type { AppData, IpProfile, Project, ProjectStep, VisualPreset } from '../../shared/types'

export type AppView = 'projects' | 'profiles' | 'assets' | 'styles' | 'settings' | 'project'

interface StudioState {
  data: AppData | null
  loaded: boolean
  activeProjectId: string | null
  view: AppView
  busyLabel: string
  notice: { type: 'success' | 'error' | 'info'; message: string } | null
  initialize: () => Promise<void>
  setView: (view: AppView) => void
  setActiveProject: (id: string | null) => void
  setBusy: (label: string) => void
  setNotice: (notice: StudioState['notice']) => void
  createProject: () => Project
  updateProject: (id: string, patch: Partial<Project> | ((project: Project) => Project)) => void
  deleteProject: (id: string) => void
  setProjectStep: (id: string, step: ProjectStep) => void
  updateData: (updater: (data: AppData) => AppData) => void
  upsertProfile: (profile: IpProfile) => void
  deleteProfile: (id: string) => void
  saveNow: () => Promise<void>
}

function newProject(visualPreset: VisualPreset = 'dense-light'): Project {
  const timestamp = new Date()
  const date = timestamp.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
  const iso = timestamp.toISOString()
  return {
    id: crypto.randomUUID(),
    name: `${date} 新内容`,
    mode: 'personal-ip',
    step: 'setup',
    platform: 'douyin',
    goal: 'trust',
    durationTarget: 60,
    aspectRatio: '9:16',
    assetPolicy: 'owned-first',
    visualPreset,
    topic: '',
    audience: '',
    coreViewpoint: '',
    realExperience: '',
    desiredFeeling: '',
    requirements: '从观众能联想到自己的处境出发，不要让任何观点变成与观众无关的自我表达。',
    productName: '',
    productFacts: '',
    productOffer: '',
    cta: '',
    references: [],
    assets: [],
    scriptVersions: [],
    storyboard: [],
    createdAt: iso,
    updatedAt: iso
  }
}

export const useStudioStore = create<StudioState>((set, get) => ({
  data: null,
  loaded: false,
  activeProjectId: null,
  view: 'projects',
  busyLabel: '',
  notice: null,
  initialize: async () => {
    const data = await window.studio.loadData()
    set({ data, loaded: true })
  },
  setView: (view) => set({ view }),
  setActiveProject: (id) => set({ activeProjectId: id, view: id ? 'project' : 'projects' }),
  setBusy: (busyLabel) => set({ busyLabel }),
  setNotice: (notice) => set({ notice }),
  createProject: () => {
    const project = newProject(get().data?.settings.defaultVisualPreset)
    const profile = get().data?.profiles[0]
    if (profile) {
      project.profileId = profile.id
      project.audience = profile.audience
    }
    get().updateData((data) => ({ ...data, projects: [project, ...data.projects] }))
    set({ activeProjectId: project.id, view: 'project' })
    return project
  },
  updateProject: (id, patch) => {
    get().updateData((data) => ({
      ...data,
      projects: data.projects.map((project) => {
        if (project.id !== id) return project
        const next = typeof patch === 'function' ? patch(project) : { ...project, ...patch }
        return { ...next, updatedAt: new Date().toISOString() }
      })
    }))
  },
  deleteProject: (id) => {
    get().updateData((data) => ({
      ...data,
      projects: data.projects.filter((project) => project.id !== id)
    }))
    if (get().activeProjectId === id) set({ activeProjectId: null, view: 'projects' })
  },
  setProjectStep: (id, step) => get().updateProject(id, { step }),
  updateData: (updater) => set((state) => state.data ? { data: updater(state.data) } : state),
  upsertProfile: (profile) => {
    get().updateData((data) => {
      const exists = data.profiles.some((item) => item.id === profile.id)
      return {
        ...data,
        profiles: exists
          ? data.profiles.map((item) => item.id === profile.id ? profile : item)
          : [profile, ...data.profiles]
      }
    })
  },
  deleteProfile: (id) => {
    get().updateData((data) => ({ ...data, profiles: data.profiles.filter((profile) => profile.id !== id) }))
  },
  saveNow: async () => {
    const data = get().data
    if (data) await window.studio.saveData(data)
  }
}))
