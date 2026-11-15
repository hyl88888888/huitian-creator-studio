import type { IpProfile, Project, ProjectStep } from '../../../shared/types'

export interface StepProps {
  project: Project
  profile?: IpProfile
  update: (patch: Partial<Project> | ((project: Project) => Project)) => void
  go: (step: ProjectStep) => void
}

