export type CreativeMode = 'personal-ip' | 'new-media' | 'ecommerce'
export type AssetPolicy = 'owned-only' | 'owned-first' | 'auto-first'
export type Platform = 'douyin' | 'wechat-video' | 'xiaohongshu' | 'bilibili' | 'other'
export type ContentGoal = 'followers' | 'trust' | 'discussion' | 'traffic' | 'conversion' | 'custom'
export type ProjectStep = 'setup' | 'understanding' | 'blueprint' | 'script' | 'storyboard' | 'export'
export type AssetKind = 'talking-head' | 'screenshot' | 'image' | 'video' | 'screen-recording' | 'audio' | 'reference'
export type AssetStatus = 'ready' | 'needs-review' | 'missing' | 'generated'
export type RulePriority = 'must' | 'prefer'
export type RuleSource = 'user' | 'profile' | 'reference' | 'system'
export type SentenceStatus = 'pass' | 'improve' | 'fail' | 'locked'
export type ShotVisualType = 'talking-head' | 'screenshot' | 'b-roll' | 'quote-card' | 'ai-visual'
export type VisualPreset = 'dense-light' | 'authentic' | 'knowledge' | 'emotion' | 'proof' | 'minimal'
export type VisualGrammar =
  | 'dense-explainer'
  | 'masked-typography'
  | 'motivated-montage'
  | 'photo-transformation'
  | 'editorial-life'
  | 'spatial-stage'
  | 'practical-demo'
export type VisualPlanConfidence = 'verified' | 'provisional' | 'generic'

export interface StoryboardVisualPlan {
  grammar: VisualGrammar
  supportingGrammars: VisualGrammar[]
  influences: string[]
  blendRationale: string
  /** @deprecated Kept only for projects saved before multi-grammar blending. */
  referenceAccount?: string
  confidence: VisualPlanConfidence
  semanticReason: string
  buildSteps: string[]
  generationPrompt?: string
}

export interface IpProfile {
  id: string
  name: string
  identity: string
  audience: string
  beliefs: string
  voice: string
  experiences: string
  preferredPhrases: string
  forbiddenPhrases: string
  visualStyle: string
  createdAt: string
  updatedAt: string
}

export interface MediaAsset {
  id: string
  name: string
  path: string
  uri: string
  kind: AssetKind
  mimeType: string
  size: number
  duration?: number
  width?: number
  height?: number
  status: AssetStatus
  note?: string
}

export interface ReferenceItem {
  id: string
  type: 'link' | 'file'
  value: string
  focus: 'copy' | 'visual' | 'both'
  assetId?: string
}

export interface CreativeRule {
  id: string
  text: string
  priority: RulePriority
  source: RuleSource
  enabled: boolean
  category: 'hard' | 'effect' | 'reference' | 'avoid' | 'inferred'
}

export interface InterviewQuestion {
  id: string
  question: string
  answer: string
  skipped?: boolean
}

export interface RequirementUnderstanding {
  summary: string
  audienceState: string
  humanDrivers: string[]
  rules: CreativeRule[]
  conflicts: string[]
  missing: string[]
  interviewQuestions: InterviewQuestion[]
  confirmed: boolean
  generatedAt: string
}

export interface BlueprintSection {
  id: string
  title: string
  purpose: string
  audienceLink: string
  content: string
  locked?: boolean
}

export interface CreativeBlueprint {
  coreAudience: string
  audienceTension: string
  coreThesis: string
  hook: string
  emotionalArc: string
  cta: string
  visualDirection: string
  sections: BlueprintSection[]
  confirmed: boolean
  generatedAt: string
}

export interface SentenceCheck {
  relatable: boolean
  humanDriver: string
  advances: boolean
  creatorCentric: boolean
  reason: string
  score: number
}

export interface ScriptSentence {
  id: string
  text: string
  role: 'situation' | 'benefit' | 'loss' | 'emotion' | 'identity' | 'story' | 'evidence' | 'turn' | 'cta'
  estimatedSeconds: number
  status: SentenceStatus
  check: SentenceCheck
  /**
   * Keeps the engine-authored value so a later run can tell the difference
   * between generated copy and a user's deliberate edit. The renderer ignores
   * this metadata, but preserves it while editing a sentence.
   */
  generation?: {
    originalText: string
    engineVersion: string
    candidateStrategy: string
  }
}

export type ScriptScoreDimension =
  | 'goalAlignment'
  | 'audienceRelevance'
  | 'specificity'
  | 'emotionalTension'
  | 'oralFluency'
  | 'constraintCompliance'

export interface ScriptScore {
  dimension: ScriptScoreDimension
  score: number
  reason: string
}

export interface ScriptEvaluation {
  totalScore: number
  hardConstraintPassed: boolean
  scores: ScriptScore[]
  violations: string[]
  strengths: string[]
  revisionPriorities: string[]
}

export interface CreativeDecisionReport {
  selectedStrategy: string
  candidatesCompared: number
  selectionReason: string
  remainingRisks: string[]
}

export interface ScriptVersion {
  id: string
  title: string
  fullText: string
  sentences: ScriptSentence[]
  estimatedSeconds: number
  complianceScore: number
  createdAt: string
  candidateStrategy?: string
  evaluation?: ScriptEvaluation
  decisionReport?: CreativeDecisionReport
}

export interface CreativeBrief {
  primaryGoal: string
  durationTarget: number
  audience: string
  desiredResponse: string
  targetAction: string
  promise: string
  hardConstraints: string[]
  softPreferences: string[]
  knownFacts: string[]
  forbiddenClaims: string[]
  lockedSentenceIds: string[]
}

export interface CreativeFeedback {
  id: string
  kind: 'accept' | 'reject' | 'edit' | 'instruction'
  originalText?: string
  revisedText?: string
  note?: string
  sentenceId?: string
  createdAt: string
}

export interface CreatorPreferenceMemory {
  key: string
  profileId?: string
  preferredExamples: string[]
  rejectedExamples: string[]
  directives: string[]
  observations: number
  updatedAt: string
}

export interface StoryboardShot {
  id: string
  order: number
  sentenceIds: string[]
  scriptText: string
  duration: number
  visualType: ShotVisualType
  visualDirection: string
  assetId?: string
  subtitle: string
  motion: string
  transition: string
  visualPlan?: StoryboardVisualPlan
  locked?: boolean
}

export interface ExportResult {
  directory: string
  files: string[]
  warnings: string[]
  createdAt: string
}

export interface Project {
  id: string
  name: string
  mode: CreativeMode
  step: ProjectStep
  platform: Platform
  goal: ContentGoal
  durationTarget: number
  aspectRatio: '9:16'
  assetPolicy: AssetPolicy
  visualPreset?: VisualPreset
  profileId?: string
  topic: string
  audience: string
  coreViewpoint: string
  realExperience: string
  desiredFeeling: string
  requirements: string
  productName: string
  productFacts: string
  productOffer: string
  cta: string
  references: ReferenceItem[]
  assets: MediaAsset[]
  understanding?: RequirementUnderstanding
  blueprint?: CreativeBlueprint
  scriptVersions: ScriptVersion[]
  activeScriptId?: string
  storyboard: StoryboardShot[]
  exportResult?: ExportResult
  createdAt: string
  updatedAt: string
}

export interface AiSettings {
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  imageModel: string
  videoModel: string
  temperature: number
  enabled: boolean
  autoGenerateMedia: boolean
  preferVideoGeneration: boolean
}

export interface AppSettings {
  ai: AiSettings
  defaultExportDirectory: string
  autoSave: boolean
  defaultVisualPreset: VisualPreset
}

export interface AppData {
  projects: Project[]
  profiles: IpProfile[]
  settings: AppSettings
  version: number
}

export interface AiRequest {
  task: 'understand' | 'blueprint' | 'script' | 'review' | 'storyboard'
  project: Project
  profile?: IpProfile
  additionalInstruction?: string
  /** Optional explicit feedback hook for a future one-click like/dislike UI. */
  feedback?: CreativeFeedback[]
  /** Defaults to 3 and is clamped to 2-4 for script generation. */
  candidateCount?: number
}

export interface FileDialogRequest {
  kind: AssetKind
  multiple?: boolean
}

export interface ExportRequest {
  project: Project
  destination?: string
  includePreview?: boolean
  includeCleanRoughCut?: boolean
}

export interface RenderProgress {
  projectId: string
  phase: string
  progress: number
  message: string
}

export interface StudioApi {
  loadData: () => Promise<AppData>
  saveData: (data: AppData) => Promise<void>
  selectFiles: (request: FileDialogRequest) => Promise<MediaAsset[]>
  chooseExportDirectory: () => Promise<string | null>
  runAiTask: <T>(request: AiRequest) => Promise<T>
  testAiConnection: (settings: AiSettings) => Promise<{ ok: boolean; message: string }>
  exportProject: (request: ExportRequest) => Promise<ExportResult>
  revealPath: (path: string) => Promise<void>
  onRenderProgress: (callback: (progress: RenderProgress) => void) => () => void
  onAiFallback: (callback: (reason: string) => void) => () => void
}
