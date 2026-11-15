import type {
  AiRequest,
  CreativeBrief,
  CreatorPreferenceMemory,
  IpProfile,
  Project,
  ScriptEvaluation,
  ScriptScore,
  ScriptScoreDimension,
  ScriptSentence,
  ScriptVersion
} from '../shared/types'

export const CREATIVE_ENGINE_VERSION = 'deliberate-1.0'

const goalLabels: Record<Project['goal'], string> = {
  followers: '让合适的人愿意持续关注',
  trust: '建立真实可信的专业信任',
  discussion: '让观众产生表达和讨论欲望',
  traffic: '让观众愿意进入下一承接页面',
  conversion: '帮助观众基于事实完成购买决策',
  custom: '完成用户明确指定的内容目的'
}

const goalActions: Record<Project['goal'], string> = {
  followers: '关注并期待下一条内容',
  trust: '相信创作者理解自己的问题',
  discussion: '评论自己的经历或观点',
  traffic: '点击或进入指定承接位置',
  conversion: '基于适配场景做出购买决定',
  custom: '执行用户指定的下一步'
}

const vaguePhrases = [
  '众所周知', '在这个时代', '赋能', '颠覆认知', '一定要', '轻松实现',
  '遥遥领先', '闭眼入', '家人们', '绝绝子', '干货满满', '价值拉满'
]

const emotionalWords = [
  '怕', '担心', '焦虑', '后悔', '损失', '错过', '被忽视', '不甘心',
  '期待', '渴望', '轻松', '安心', '掌控', '证明', '选择', '代价'
]

const relatableWords = [
  '你', '我们', '很多人', '正在', '遇到', '经历', '以为', '担心', '想要',
  '每次', '当你', '如果', '有没有', '自己', '工作', '生活', '做决定'
]

function uniqueRecent(values: string[], limit: number): string[] {
  const output: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value.slice(0, 360))
  }
  return output.slice(-limit)
}

function uniqueFirst(values: string[], limit: number): string[] {
  const output: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value.slice(0, 360))
    if (output.length >= limit) break
  }
  return output
}

function splitRequirements(value: string): string[] {
  return value
    .split(/[\n；;。]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
}

function splitPhraseList(value: string): string[] {
  return value
    .split(/[\n、，,；;。]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

function activeScript(project: Project): ScriptVersion | undefined {
  return project.scriptVersions.find((item) => item.id === project.activeScriptId)
    ?? project.scriptVersions.at(-1)
}

export function createEmptyPreferenceMemory(profileId?: string): CreatorPreferenceMemory {
  return {
    key: profileId || 'global',
    profileId,
    preferredExamples: [],
    rejectedExamples: [],
    directives: [],
    observations: 0,
    updatedAt: new Date(0).toISOString()
  }
}

/**
 * Learns only from observable user choices. It does not mutate prompts or code,
 * and it keeps a small bounded memory so old preferences can be corrected.
 */
export function learnPreferenceMemory(
  current: CreatorPreferenceMemory | undefined,
  request: AiRequest
): CreatorPreferenceMemory {
  const memory = current ?? createEmptyPreferenceMemory(request.project.profileId)
  const preferred = [...memory.preferredExamples]
  const rejected = [...memory.rejectedExamples]
  const directives = [...memory.directives]
  let observations = memory.observations
  const preferredSet = new Set(preferred.map((item) => item.trim()))
  const rejectedSet = new Set(rejected.map((item) => item.trim()))
  const directiveSet = new Set(directives.map((item) => item.trim()))
  const observe = (values: string[], seen: Set<string>, raw: string | undefined): void => {
    const value = raw?.trim()
    if (!value || seen.has(value)) return
    values.push(value)
    seen.add(value)
    observations += 1
  }

  const script = activeScript(request.project)
  for (const sentence of script?.sentences ?? []) {
    if (sentence.status === 'locked') {
      observe(preferred, preferredSet, sentence.text)
    }
    const original = sentence.generation?.originalText?.trim()
    if (original && sentence.text.trim() !== original) {
      observe(rejected, rejectedSet, original)
      observe(preferred, preferredSet, sentence.text)
    }
  }

  for (const feedback of request.feedback ?? []) {
    const original = feedback.originalText?.trim()
    const revised = feedback.revisedText?.trim()
    const note = feedback.note?.trim()
    if (feedback.kind === 'accept') observe(preferred, preferredSet, revised || original)
    if (feedback.kind === 'reject') observe(rejected, rejectedSet, original)
    if (feedback.kind === 'edit') {
      observe(rejected, rejectedSet, original)
      observe(preferred, preferredSet, revised)
    }
    if (feedback.kind === 'instruction' || note) observe(directives, directiveSet, note)
  }

  const additional = request.additionalInstruction?.trim()
  if (additional && !/^重新逐句检查，只修复未通过或建议优化的句子/.test(additional)) {
    observe(directives, directiveSet, additional)
  }

  return {
    key: memory.key,
    profileId: memory.profileId ?? request.project.profileId,
    preferredExamples: uniqueRecent(preferred, 18),
    rejectedExamples: uniqueRecent(rejected, 18),
    directives: uniqueRecent(directives, 20),
    observations,
    updatedAt: observations === memory.observations ? memory.updatedAt : new Date().toISOString()
  }
}

export function buildCreativeBrief(
  project: Project,
  profile?: IpProfile,
  memory?: CreatorPreferenceMemory
): CreativeBrief {
  const enabledRules = project.understanding?.rules.filter((rule) => rule.enabled) ?? []
  const mustRules = enabledRules.filter((rule) => rule.priority === 'must').map((rule) => rule.text)
  const preferRules = enabledRules.filter((rule) => rule.priority === 'prefer').map((rule) => rule.text)
  const requirementRules = splitRequirements(project.requirements)
  const profileAvoid = splitPhraseList(profile?.forbiddenPhrases ?? '')
  const profileLikes = splitPhraseList(profile?.preferredPhrases ?? '')
  const lockedSentenceIds = activeScript(project)?.sentences
    .filter((sentence) => sentence.status === 'locked')
    .map((sentence) => sentence.id) ?? []
  const facts = [project.realExperience, project.productFacts, profile?.experiences ?? '']
    .flatMap(splitRequirements)

  return {
    primaryGoal: goalLabels[project.goal],
    durationTarget: project.durationTarget,
    audience: project.audience.trim() || profile?.audience.trim() || '与主题有关、但尚未被精确定义的观众',
    desiredResponse: project.desiredFeeling.trim() || goalLabels[project.goal],
    targetAction: project.cta.trim() || goalActions[project.goal],
    promise: project.coreViewpoint.trim() || project.topic.trim() || project.productName.trim() || '给观众一个新的理解和可执行选择',
    hardConstraints: uniqueFirst([
      ...requirementRules,
      ...mustRules,
      `自然口播时长尽量接近 ${project.durationTarget} 秒`,
      '不得编造用户未提供的经历、数据、效果、价格、资质或背书',
      '对标只学习抽象结构，不复刻原句和独特表达'
    ], 30),
    softPreferences: uniqueRecent([
      profile?.voice ?? '',
      ...profileLikes,
      ...profileAvoid.map((item) => `避免：${item}`),
      ...preferRules,
      ...(memory?.directives ?? []),
      ...(memory?.preferredExamples.slice(-6).map((item) => `用户喜欢过的表达：${item}`) ?? []),
      ...(memory?.rejectedExamples.slice(-6).map((item) => `用户改掉或拒绝过的表达：${item}`) ?? [])
    ], 30),
    knownFacts: uniqueRecent(facts, 24),
    forbiddenClaims: [
      '没有来源的数字和排名',
      '无法验证的绝对效果承诺',
      '用户没有提供的个人经历',
      ...profileAvoid
    ],
    lockedSentenceIds
  }
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function dimension(
  name: ScriptScoreDimension,
  score: number,
  reason: string
): ScriptScore {
  return { dimension: name, score: clamp(score), reason }
}

function numericClaims(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?\s*(?:%|倍|万|元|天|小时|分钟|秒|个|名|款)/g) ?? []
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => word && text.includes(word))
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

/** Deterministic rubric used to rank candidates; it is deliberately not the model grading itself. */
export function evaluateScript(script: ScriptVersion, brief: CreativeBrief): ScriptEvaluation {
  const texts = script.sentences.map((sentence) => sentence.text.trim()).filter(Boolean)
  const fullText = texts.join('\n')
  const violations: string[] = []
  const duration = script.sentences.reduce((sum, item) => sum + item.estimatedSeconds, 0)
  const durationTarget = brief.durationTarget
  if (duration < durationTarget * 0.55 || duration > durationTarget * 1.55) {
    violations.push(`预计 ${Math.round(duration)} 秒，与 ${durationTarget} 秒目标偏差过大`)
  }

  const allKnownFacts = brief.knownFacts.join(' ')
  for (const claim of numericClaims(fullText)) {
    if (!allKnownFacts.includes(claim)) violations.push(`出现未在已知事实中找到依据的数字“${claim}”`)
  }
  if (/(百分百|保证|绝对有效|全网第一|永久有效|治愈|稳赚|零风险)/.test(fullText)) {
    violations.push('出现绝对效果、排名或零风险承诺')
  }

  const forbiddenTexts = brief.forbiddenClaims
    .filter((item) => item.length <= 28 && !/没有|无法|未提供/.test(item))
  for (const phrase of forbiddenTexts) {
    if (fullText.includes(phrase)) violations.push(`出现用户要求避免的表达“${phrase}”`)
  }

  const relevanceSignals = texts.map((text, index) => {
    const role = script.sentences[index]?.role
    let score = containsAny(text, relatableWords) ? 76 : 55
    if (containsAny(text, emotionalWords)) score += 9
    if (['benefit', 'loss', 'emotion', 'identity', 'cta'].includes(role ?? '')) score += 6
    if (/^我(认为|觉得|发现|做了|研究)/.test(text) && !text.includes('你')) score -= 22
    return clamp(score)
  })
  const audienceRelevance = average(relevanceSignals)

  const roleSet = new Set(script.sentences.map((sentence) => sentence.role))
  let goalAlignment = 60
  if (roleSet.has('cta')) goalAlignment += 12
  if (fullText.includes(brief.targetAction.slice(0, 6))) goalAlignment += 8
  if (roleSet.has('benefit') || roleSet.has('turn')) goalAlignment += 8
  if (brief.primaryGoal.includes('信任') && (roleSet.has('story') || roleSet.has('evidence'))) goalAlignment += 8
  if (brief.primaryGoal.includes('购买') && roleSet.has('evidence')) goalAlignment += 8

  const detailSignals = texts.filter((text) =>
    /\d|有一次|那天|当时|具体|比如|例如|场景|事实|截图|对话|结果/.test(text)
  ).length
  const vagueHits = vaguePhrases.filter((phrase) => fullText.includes(phrase)).length
  const specificity = 55 + Math.min(35, detailSignals * 7) - vagueHits * 10

  const tensionRoles = script.sentences.filter((sentence) =>
    ['loss', 'emotion', 'turn'].includes(sentence.role)
  ).length
  const emotionalHits = emotionalWords.filter((word) => fullText.includes(word)).length
  const emotionalTension = 52 + Math.min(28, tensionRoles * 7) + Math.min(16, emotionalHits * 3)

  const fluentLines = texts.map((text) => {
    let score = text.length >= 8 && text.length <= 52 ? 84 : text.length <= 72 ? 70 : 52
    if (/[,，]{2}|[。！？][。！？]/.test(text)) score -= 8
    if ((text.match(/，/g) ?? []).length > 4) score -= 10
    return score
  })
  const oralFluency = average(fluentLines)

  const mustRules = brief.hardConstraints.length
  const constraintCompliance = 92 - violations.length * 20 - (mustRules === 0 ? 5 : 0)
  const scores = [
    dimension('goalAlignment', goalAlignment, '是否推动本条内容的唯一目标和下一步行动'),
    dimension('audienceRelevance', audienceRelevance, '逐句是否能连接观众处境、利益、损失、情绪或身份'),
    dimension('specificity', specificity, '是否有可感知的事实、场景与细节，并减少空话'),
    dimension('emotionalTension', emotionalTension, '是否形成处境、代价与认知转折'),
    dimension('oralFluency', oralFluency, '句长、停顿和信息密度是否适合自然口播'),
    dimension('constraintCompliance', constraintCompliance, '硬性要求、事实边界和目标时长是否守住')
  ]
  const weights: Record<ScriptScoreDimension, number> = {
    goalAlignment: 0.2,
    audienceRelevance: 0.23,
    specificity: 0.16,
    emotionalTension: 0.14,
    oralFluency: 0.11,
    constraintCompliance: 0.16
  }
  let totalScore = scores.reduce((sum, item) => sum + item.score * weights[item.dimension], 0)
  if (violations.length) totalScore = Math.min(totalScore, 78 - (violations.length - 1) * 5)
  const strengths = scores
    .filter((item) => item.score >= 78)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.reason)
    .slice(0, 3)
  const revisionPriorities = [
    ...violations,
    ...scores
      .filter((item) => item.score < 72)
      .sort((a, b) => a.score - b.score)
      .map((item) => item.reason)
  ].slice(0, 5)

  return {
    totalScore: clamp(totalScore),
    hardConstraintPassed: violations.length === 0,
    scores,
    violations,
    strengths,
    revisionPriorities
  }
}

function recalculateScript(script: ScriptVersion): ScriptVersion {
  const estimatedSeconds = Math.round(script.sentences.reduce((sum, sentence) => sum + sentence.estimatedSeconds, 0))
  return {
    ...script,
    fullText: script.sentences.map((sentence) => sentence.text).join('\n'),
    estimatedSeconds
  }
}

export function preserveLockedSentences(source: ScriptVersion | undefined, revised: ScriptVersion): ScriptVersion {
  if (!source) return revised
  const locked = source.sentences.filter((sentence) => sentence.status === 'locked')
  if (!locked.length) return revised
  const used = new Set<number>()
  for (const original of locked) {
    const matchingIndex = revised.sentences.findIndex((candidate) => candidate.id === original.id)
    const sourceIndex = source.sentences.findIndex((candidate) => candidate.id === original.id)
    if (matchingIndex >= 0) used.add(matchingIndex)
    else if (sourceIndex >= 0 && sourceIndex < revised.sentences.length) used.add(sourceIndex)
  }
  const sentences = source.sentences.map((original) => {
    if (original.status === 'locked') return { ...original, status: 'locked' as const }
    let revisedIndex = revised.sentences.findIndex((candidate, index) =>
      !used.has(index) && candidate.id === original.id
    )
    if (revisedIndex < 0) {
      revisedIndex = revised.sentences.findIndex((_candidate, index) => !used.has(index))
    }
    if (revisedIndex < 0) return { ...original }
    used.add(revisedIndex)
    return revised.sentences[revisedIndex]
  })
  for (const [index, sentence] of revised.sentences.entries()) {
    if (!used.has(index) && !locked.some((item) => item.id === sentence.id)) sentences.push(sentence)
  }
  return recalculateScript({ ...revised, sentences })
}

export function attachGenerationMetadata(script: ScriptVersion, strategy: string): ScriptVersion {
  return recalculateScript({
    ...script,
    candidateStrategy: strategy,
    sentences: script.sentences.map((sentence) => ({
      ...sentence,
      estimatedSeconds: Math.max(1.2, Math.round((sentence.text.trim().length / 4.1) * 10) / 10),
      generation: sentence.generation ?? {
        originalText: sentence.text,
        engineVersion: CREATIVE_ENGINE_VERSION,
        candidateStrategy: strategy
      }
    }))
  })
}

export interface RankedCandidate {
  script: ScriptVersion
  evaluation: ScriptEvaluation
  strategy: string
}

export function rankScriptCandidates(
  candidates: Array<{ script: ScriptVersion; strategy: string }>,
  brief: CreativeBrief,
  lockedSource?: ScriptVersion
): RankedCandidate[] {
  return candidates
    .map(({ script, strategy }) => {
      const prepared = attachGenerationMetadata(preserveLockedSentences(lockedSource, script), strategy)
      return { script: prepared, evaluation: evaluateScript(prepared, brief), strategy }
    })
    .sort((a, b) => {
      if (a.evaluation.hardConstraintPassed !== b.evaluation.hardConstraintPassed) {
        return a.evaluation.hardConstraintPassed ? -1 : 1
      }
      return b.evaluation.totalScore - a.evaluation.totalScore
    })
}

export function finalizeSelectedScript(
  selected: RankedCandidate,
  compared: number,
  brief: CreativeBrief,
  lockedSource?: ScriptVersion,
  selectionReason?: string
): ScriptVersion {
  const locked = preserveLockedSentences(lockedSource, selected.script)
  const evaluation = evaluateScript(locked, brief)
  return recalculateScript({
    ...locked,
    complianceScore: evaluation.totalScore,
    evaluation,
    decisionReport: {
      selectedStrategy: selected.strategy,
      candidatesCompared: compared,
      selectionReason: selectionReason || `通过同一目标和约束量表比较后，该方案综合得分 ${evaluation.totalScore}，且${evaluation.hardConstraintPassed ? '通过' : '仍未完全通过'}硬性约束。`,
      remainingRisks: evaluation.revisionPriorities
    }
  })
}

function cloneSentence(sentence: ScriptSentence, text = sentence.text): ScriptSentence {
  return {
    ...sentence,
    id: crypto.randomUUID(),
    text,
    estimatedSeconds: Math.max(1.5, Math.round((text.length / 4.1) * 10) / 10),
    status: sentence.status === 'locked' ? 'locked' : 'improve',
    generation: undefined
  }
}

function cloneVariant(base: ScriptVersion, strategy: string, firstText?: string): ScriptVersion {
  const sentences = base.sentences.map((sentence, index) => cloneSentence(sentence, index === 0 && firstText ? firstText : sentence.text))
  return recalculateScript({
    ...base,
    id: crypto.randomUUID(),
    title: `${base.title.replace(/｜.*$/, '')}｜${strategy}`,
    sentences,
    createdAt: new Date().toISOString(),
    candidateStrategy: strategy,
    evaluation: undefined,
    decisionReport: undefined
  })
}

/** Creates genuinely different openings locally; remote mode creates full distinct drafts. */
export function createLocalScriptCandidates(base: ScriptVersion, project: Project): Array<{ script: ScriptVersion; strategy: string }> {
  const topic = project.topic.trim() || project.coreViewpoint.trim() || project.productName.trim() || '这件事'
  const audience = project.audience.trim() || '正为这件事犹豫的人'
  const situationHook = project.mode === 'ecommerce'
    ? `如果你正在比较${project.productName || topic}，先别被参数带着走：真正要判断的是，它能不能解决你此刻最具体的麻烦。`
    : `如果你也在认真对待“${topic}”，却越准备越不敢开始，真正拦住你的可能不是方法。`
  const tensionHook = project.mode === 'ecommerce'
    ? `买${project.productName || topic}最怕的不是贵一点，而是每个卖点都很好听，最后却没有一个适合你的真实场景。`
    : `对${audience}来说，最消耗人的往往不是不会做，而是投入以后依然没人回应。`
  return [
    { script: cloneVariant(base, '观众处境直入', situationHook), strategy: '观众处境直入' },
    { script: cloneVariant(base, '损失张力开场', tensionHook), strategy: '损失张力开场' },
    { script: cloneVariant(base, '原始蓝图稳健稿'), strategy: '原始蓝图稳健稿' }
  ]
}

export function deliberateLocalScript(
  base: ScriptVersion,
  project: Project,
  profile?: IpProfile,
  memory?: CreatorPreferenceMemory,
  lockedSource?: ScriptVersion
): ScriptVersion {
  const brief = buildCreativeBrief(project, profile, memory)
  const ranked = rankScriptCandidates(createLocalScriptCandidates(base, project), brief, lockedSource)
  return finalizeSelectedScript(ranked[0], ranked.length, brief, lockedSource)
}

export function preferenceMemoryForPrompt(memory?: CreatorPreferenceMemory): object {
  if (!memory || memory.observations === 0) return { observations: 0 }
  return {
    observations: memory.observations,
    directives: memory.directives.slice(-12),
    preferredExamples: memory.preferredExamples.slice(-8),
    rejectedExamples: memory.rejectedExamples.slice(-8),
    instruction: '偏好记忆只用于风格取舍，不得覆盖本次硬性要求、事实边界或锁定内容。'
  }
}
