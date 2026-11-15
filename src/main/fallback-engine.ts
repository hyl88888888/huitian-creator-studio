import type {
  CreativeBlueprint,
  CreativeRule,
  IpProfile,
  Project,
  RequirementUnderstanding,
  ScriptSentence,
  ScriptVersion,
  StoryboardShot
} from '../shared/types'

function now(): string {
  return new Date().toISOString()
}

function id(): string {
  return crypto.randomUUID()
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function sentenceCheck(
  text: string,
  role: ScriptSentence['role'],
  index: number
): ScriptSentence['check'] {
  const relatableWords = ['你', '我们', '很多人', '正在', '经历', '发现', '害怕', '想要', '以为', '自己']
  const humanWords = ['怕', '想', '损失', '时间', '信任', '焦虑', '面子', '被看见', '安全感', '选择']
  const relatable = hasAny(text, relatableWords) || ['story', 'evidence', 'turn'].includes(role)
  const humanDriver = hasAny(text, humanWords)
    ? '欲望、损失或身份关联'
    : role === 'evidence'
      ? '可信度'
      : role === 'cta'
        ? '行动与获得感'
        : '处境关联'
  const creatorCentric = /^我(做|研究|认为|觉得|发现)/.test(text) && !text.includes('你')
  const advances = text.length >= 8
  const score = Math.max(52, Math.min(96, 66 + (relatable ? 13 : 0) + (advances ? 9 : 0) - (creatorCentric ? 18 : 0) - (index === 0 && !relatable ? 8 : 0)))
  return {
    relatable,
    humanDriver,
    advances,
    creatorCentric,
    reason: creatorCentric
      ? '这句话更像创作者自述，需要补上它和观众的关系。'
      : relatable
        ? '观众能从自己的处境、利益或情绪中理解这句话。'
        : '建议补充具体处境或说明这件事为什么与观众有关。',
    score
  }
}

function createSentence(text: string, role: ScriptSentence['role'], index: number): ScriptSentence {
  const check = sentenceCheck(text, role, index)
  return {
    id: id(),
    text,
    role,
    estimatedSeconds: Math.max(1.5, Math.round((text.length / 4.1) * 10) / 10),
    status: check.score >= 78 ? 'pass' : check.score >= 64 ? 'improve' : 'fail',
    check
  }
}

function topicOf(project: Project): string {
  const input = project.topic.trim()
  if (input) {
    const quoted = input.match(/[“「『\"]([^”」』\"]{3,80})[”」』\"]/)?.[1]?.trim()
    if (quoted) return quoted.slice(0, 48)
    const introduced = input.match(/(?:想讲|要讲|讲讲|讲|关于|围绕|主题是|核心是)[：:\s]*([^\n。！？；]{3,80})/)?.[1]?.trim()
    const candidate = (introduced || input.split(/[\n。！？；]/)[0] || input)
      .replace(/^我想(?:做|拍|写|生成)?(?:一条|一个)?(?:个人IP|新媒体|电商)?(?:的)?(?:口播|短视频|视频|内容|文案)?[，,:：\s]*/i, '')
      .split(/(?:要求|希望|需要|要从|开头|结尾|口语化|不要|不能|必须)/)[0]
      .trim()
    if (candidate) return candidate.slice(0, 48)
  }
  return project.coreViewpoint.trim() || project.productName.trim() || '这件真正影响你的事'
}

function naturalLanguageRequirements(project: Project): string[] {
  const values = `${project.requirements}\n${project.topic}`
    .split(/[\n。；;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .filter((item) => /(?:要|不要|不能|必须|希望|开头|结尾|口语|从.+角度|每一句|每句话|避免|禁止|严格)/.test(item))
    .map((item) => item.replace(/^我想(?:做|拍|写|生成).{0,18}?[，,:：]/, '').trim())
  return [...new Set(values)].slice(0, 8)
}

function audienceOf(project: Project, profile?: IpProfile): string {
  return project.audience.trim() || profile?.audience.trim() || '正在面对同样困惑的人'
}

function baseRules(project: Project, profile?: IpProfile): CreativeRule[] {
  const raw = `${project.topic} ${project.requirements} ${profile?.forbiddenPhrases ?? ''}`
  const rules: CreativeRule[] = [
    {
      id: id(),
      text: `成片目标约 ${project.durationTarget} 秒，文案应适合自然口播`,
      priority: 'must',
      source: 'user',
      enabled: true,
      category: 'hard'
    },
    {
      id: id(),
      text: '只使用用户提供或确认的事实，不虚构经历、数据与效果',
      priority: 'must',
      source: 'system',
      enabled: true,
      category: 'hard'
    },
    {
      id: id(),
      text: '开头先进入观众可识别的具体处境，不从创作者履历讲起',
      priority: 'must',
      source: 'system',
      enabled: true,
      category: 'effect'
    },
    {
      id: id(),
      text: '个人经历只能作为帮助观众理解问题的证据，不能变成自我炫耀',
      priority: 'prefer',
      source: profile ? 'profile' : 'system',
      enabled: true,
      category: 'effect'
    },
    {
      id: id(),
      text: '学习对标的抽象结构、节奏和镜头规律，不复用原句、人物、音乐和独特画面',
      priority: 'must',
      source: project.references.length ? 'reference' : 'system',
      enabled: true,
      category: 'avoid'
    }
  ]

  if (hasAny(raw, ['关我屁事', '人性', '关联', '联想到自己', '代入'])) {
    rules.push(
      {
        id: id(),
        text: '每个观点都要回答“这会怎样影响观众”，但不通过机械重复“你”制造关联',
        priority: 'must',
        source: 'user',
        enabled: true,
        category: 'effect'
      },
      {
        id: id(),
        text: '抽象结论后必须跟具体场景、代价、欲望、恐惧或身份认同',
        priority: 'must',
        source: 'user',
        enabled: true,
        category: 'effect'
      },
      {
        id: id(),
        text: '逐句运行“关我何事”检查，不通过的句子只做局部重写',
        priority: 'must',
        source: 'system',
        enabled: true,
        category: 'inferred'
      }
    )
  }

  for (const requirement of naturalLanguageRequirements(project).reverse()) {
    rules.unshift({
      id: id(),
      text: requirement,
      priority: 'must',
      source: 'user',
      enabled: true,
      category: /不要|不能|禁止|避免/.test(requirement) ? 'avoid' : 'hard'
    })
  }
  return rules
}

export function fallbackUnderstanding(project: Project, profile?: IpProfile): RequirementUnderstanding {
  const topic = topicOf(project)
  const audience = audienceOf(project, profile)
  const conflicts: string[] = []
  const missing: string[] = []
  if (project.durationTarget <= 20 && project.requirements.length > 280) {
    conflicts.push('目标时长较短，但要求内容很多，建议保留一个核心观点。')
  }
  if (!project.topic.trim()) missing.push('还没有明确本期主题，当前会使用核心观点作为主题。')
  if (!project.audience.trim() && !profile?.audience.trim()) missing.push('缺少更具体的目标观众，关联感可能不够精准。')
  if (project.mode === 'personal-ip' && !project.realExperience.trim() && !profile?.experiences.trim()) {
    missing.push('缺少真实经历或细节，文案可能正确但不够独特。')
  }
  return {
    summary: `我理解你要围绕“${topic}”，写给${audience}。重点不是机械套用流行句式，而是让观众从自己的处境、欲望或担忧中感到这件事与自己有关；创作者的观点和经历只用来提供帮助与可信度。`,
    audienceState: project.desiredFeeling.trim()
      ? `${audience}希望在看完后感到：${project.desiredFeeling.trim()}`
      : `${audience}正处在“知道需要改变，但还没有找到具体抓手”的状态`,
    humanDrivers: project.mode === 'ecommerce'
      ? ['减少损失', '获得确定感', '证明选择正确']
      : ['被理解', '避免走弯路', '获得掌控感', '被看见'],
    rules: baseRules(project, profile),
    conflicts,
    missing,
    interviewQuestions: project.mode === 'personal-ip'
      ? [
          { id: id(), question: `你为什么会对“${topic}”产生这个观点？`, answer: '' },
          { id: id(), question: '有没有一个当时很具体的场景、人物或细节？', answer: '' },
          { id: id(), question: '你原来怎么想，后来发生了什么让你改变？', answer: '' },
          { id: id(), question: `观众在这件事上最怕失去什么，或者最想得到什么？`, answer: '' }
        ]
      : [],
    confirmed: false,
    generatedAt: now()
  }
}

export function fallbackBlueprint(project: Project, profile?: IpProfile): CreativeBlueprint {
  const topic = topicOf(project)
  const audience = audienceOf(project, profile)
  const experience = project.realExperience.trim() || profile?.experiences.trim() || '一个真实的小场景或反常识观察'
  return {
    coreAudience: audience,
    audienceTension: `他们对“${topic}”并非没有兴趣，而是还没看见这件事与自己当下处境的直接关系。`,
    coreThesis: project.coreViewpoint.trim() || `真正改变结果的不是知道更多，而是重新看懂“${topic}”背后的选择。`,
    hook: `从一个观众熟悉却很少说出口的处境切入，让他第一秒先想到自己。`,
    emotionalArc: '被说中 → 产生疑问 → 看见代价 → 理解转折 → 获得可执行的选择',
    cta: project.cta.trim() || (project.goal === 'discussion' ? '邀请观众说出自己的真实经历' : '给观众一个低门槛的下一步'),
    visualDirection: profile?.visualStyle.trim() || '默认浅色高密度爆款风：人物口播建立信任，短字幕和强标题提高信息抓取，截图/B-roll负责证据与解释，转折使用少量原创观点卡；快速但有秩序。',
    sections: [
      {
        id: id(),
        title: '观众处境',
        purpose: '让观众先认出自己',
        audienceLink: '具体说出他正在经历却没有表达清楚的感受',
        content: `用“${topic}”相关的日常场景开场`
      },
      {
        id: id(),
        title: '错误解释',
        purpose: '制造认知张力',
        audienceLink: '指出观众以为的问题，为什么不是真正的问题',
        content: '呈现常见误区，不嘲讽观众'
      },
      {
        id: id(),
        title: '真实故事',
        purpose: '提供可信度和情绪',
        audienceLink: '故事最后必须回到观众能获得什么',
        content: experience
      },
      {
        id: id(),
        title: '观点转折',
        purpose: '给出新的理解',
        audienceLink: '明确这会怎样改变观众下一次的选择',
        content: project.coreViewpoint.trim() || `揭示“${topic}”背后的真正驱动力`
      },
      {
        id: id(),
        title: '行动落点',
        purpose: '留下可执行的一步',
        audienceLink: '行动足够具体，不用口号结束',
        content: project.cta.trim() || '给出一个今天就能做的小动作'
      }
    ],
    confirmed: false,
    generatedAt: now()
  }
}

export function fallbackScript(project: Project, profile?: IpProfile): ScriptVersion {
  const topic = topicOf(project)
  const audience = audienceOf(project, profile)
  const viewpoint = project.coreViewpoint.trim() || `真正拉开差距的，从来不是你懂了多少，而是你有没有看见“${topic}”和自己究竟有什么关系。`
  const experience = project.realExperience.trim() || profile?.experiences.trim()
  const source = project.mode === 'ecommerce'
    ? [
        [`你买${project.productName || '一件东西'}时，真正怕的往往不是多花一点钱，而是花了钱却没有解决原来的问题。`, 'situation'],
        [`所以先别急着看一堆参数，先问自己：我最想减少的麻烦到底是什么？`, 'turn'],
        [project.productFacts.trim() ? `这件产品能被验证的事实是：${project.productFacts.trim()}。` : '真正值得说的卖点，必须能被事实证明，而不是听起来很厉害。', 'evidence'],
        [`当这个事实正好对应你的使用场景，它才是价值；否则只是与自己无关的信息。`, 'benefit'],
        [project.productOffer.trim() ? `如果你正在比较选择，当前信息是：${project.productOffer.trim()}。` : '做决定前，把自己的场景和证据对上，比被一句口号推动更可靠。', 'benefit'],
        [project.cta.trim() || '先把你最想解决的问题写下来，再判断它是不是适合你。', 'cta']
      ]
    : [
        [`你有没有发现，越是认真对待“${topic}”，越容易在真正开始前先怀疑自己。`, 'situation'],
        [`你以为自己缺的是方法，其实很多时候，你怕的是认真做了以后，仍然没有人回应。`, 'emotion'],
        [`这种怕被忽视的感觉，会让人不断准备，却迟迟不愿意把真实的东西拿出来。`, 'loss'],
        [experience ? `我也经历过一个具体时刻：${experience}` : `很多人不是没有经验，而是总觉得自己走过的那点弯路，不值得拿出来讲。`, 'story'],
        [`可对${audience}来说，你已经走过的路，恰好可能是他最想省下的时间。`, 'benefit'],
        [viewpoint, 'turn'],
        [`下一次准备表达时，别先问“这够不够厉害”，先问“它能帮谁少走一步”。`, 'benefit'],
        [project.cta.trim() || `如果你也在经历同样的事，留下一句你的真实感受，我们从那里继续。`, 'cta']
      ]
  const roles = source.map((item) => item[1] as ScriptSentence['role'])
  const sentences = source.map((item, index) => createSentence(item[0], roles[index], index))
  const estimatedSeconds = Math.round(sentences.reduce((sum, sentence) => sum + sentence.estimatedSeconds, 0))
  const complianceScore = Math.round(sentences.reduce((sum, sentence) => sum + sentence.check.score, 0) / sentences.length)
  return {
    id: id(),
    title: `${topic}｜第一版`,
    fullText: sentences.map((sentence) => sentence.text).join('\n'),
    sentences,
    estimatedSeconds,
    complianceScore,
    createdAt: now()
  }
}

function improveSentenceForAudience(
  sentence: ScriptSentence,
  project: Project,
  profile?: IpProfile
): string {
  const check = sentenceCheck(sentence.text, sentence.role, 1)
  if (check.score >= 78 || ['story', 'evidence', 'turn'].includes(sentence.role)) return sentence.text
  const audience = audienceOf(project, profile)
  const clean = sentence.text.replace(/[。！？!?]+$/, '')
  if (check.creatorCentric) {
    return `这段经历对${audience}真正有用的地方是：${clean.replace(/^我(?:认为|觉得|发现)?/, '')}。`
  }
  if (sentence.role === 'cta') return `如果你正在面对同样的问题，${clean}。`
  return `对${audience}来说，${clean}，因为它会直接影响下一次选择。`
}

/** Local review keeps user-approved lines byte-for-byte and only repairs weak lines. */
export function fallbackReview(project: Project, profile?: IpProfile): ScriptVersion {
  const source = project.scriptVersions.find((item) => item.id === project.activeScriptId)
    ?? project.scriptVersions.at(-1)
  if (!source) return fallbackScript(project, profile)
  const sentences = source.sentences.map((sentence, index) => {
    if (sentence.status === 'locked' || sentence.status === 'pass') return { ...sentence }
    const text = improveSentenceForAudience(sentence, project, profile)
    const next = createSentence(text, sentence.role, index)
    return {
      ...next,
      id: sentence.id,
      generation: sentence.generation
    }
  })
  const estimatedSeconds = Math.round(sentences.reduce((sum, sentence) => sum + sentence.estimatedSeconds, 0))
  const complianceScore = Math.round(sentences.reduce((sum, sentence) => sum + sentence.check.score, 0) / Math.max(1, sentences.length))
  return {
    ...source,
    id: id(),
    title: `${source.title.replace(/｜.*$/, '')}｜本地复盘版`,
    fullText: sentences.map((sentence) => sentence.text).join('\n'),
    sentences,
    estimatedSeconds,
    complianceScore,
    createdAt: now()
  }
}

type VisualPlan = NonNullable<StoryboardShot['visualPlan']>

function visualPlanFor(sentence: ScriptSentence, index: number): VisualPlan {
  const text = sentence.text.replace(/\s+/g, '')
  const promptSubject = text.slice(0, 48).replace(/[“”「」]/g, '')
  const isPhotoTransformation = /原图|修图|P图|前后(?:对比|变化|效果)|成片效果|照片.+(?:变成|变化)|抠图前后/.test(text)
  const isPracticalDemo = /教程|实操|演示|拍摄|拍照|摄影|机位|手机.+(?:放|架|打开|点击)|打开.+(?:相机|软件)|跟着做|照着做|第[一二三四五]步|\d+步|三步|录屏|操作/.test(text)
  const isDenseExplanation = sentence.role === 'evidence'
    || /\d|数据|方法|原理|逻辑|原因|流程|清单|区别|对比|为什么|意味着|事实证明/.test(text)
  const isMotivatedTurn = sentence.role === 'turn'
    || /但是|但真正|所以|因为|直到|后来|结果|反而|这才|于是|从.+到/.test(text)
  const isRhythmicStatement = ['loss', 'emotion', 'identity'].includes(sentence.role)
    || /不是.+而是|越.+越|别再|记住|最怕|以为.+却|偏偏|关我|不敢|值得/.test(text)
  const isSpatialStage = index === 0
    || sentence.role === 'identity'
    || /开场|注意|想象|看见|关键|认知|观点|关系|本质|抽象|你以为|换个角度/.test(text)

  if (isPhotoTransformation) {
    return {
      grammar: 'photo-transformation',
      supportingGrammars: ['practical-demo', 'spatial-stage'],
      influences: [
        '小小小小fish：实拍过程与前后结果实证（已核验）',
        'Z嗯：人物和画面的尺度与空间变化（已核验）',
        '回天：语义优先的原创同构图设计'
      ],
      blendRationale: '以前后同构图变化为主，用实拍过程补足可信证据，再用空间舞台同时容纳手机画面与人物讲解。',
      confidence: 'verified',
      semanticReason: '这句直接涉及照片或视觉结果变化，最需要让观众同时看见原始状态、操作证据和最终结果。',
      buildSteps: [
        '优先使用用户自己的原图与成片，统一主体位置、裁切比例和视线方向',
        '保留屏幕录制或手部实拍作为过程证据，把讲解人像缩小放进非核心区域',
        '沿主体轮廓做原创抠图，用遮罩扫过或匹配切换揭示前后变化',
        '前后画面保持同一视觉锚点，最后回到完整成片并标注真实操作步骤'
      ],
      generationPrompt: `为竖屏短视频制作原创浅色照片变化画面，主题是“${promptSubject}”。使用虚构但自然的通用场景，不生成可识别公众人物；设计前后同构图、轮廓抠图、遮罩揭示和轻视差，不复刻任何对标作品的具体照片、排版或标识。`
    }
  }

  if (isPracticalDemo) {
    return {
      grammar: 'practical-demo',
      supportingGrammars: ['dense-explainer', 'spatial-stage'],
      influences: [
        '小小小小fish：低门槛实拍、过程证据与屏幕录制主舞台（已核验）',
        'GenJi：步骤信息的模块化组织（已核验）',
        'Z嗯：小人像讲解与多层素材空间（已核验）'
      ],
      blendRationale: '以可复现的真实演示为主，模块卡片负责压缩步骤信息，空间舞台让录屏、实拍证据和讲解人像同时保持清楚。',
      confidence: 'verified',
      semanticReason: '这句包含明确操作、拍摄、步骤或教程意图，观众需要先看见怎么做和做到哪一步，再听抽象解释。',
      buildSteps: [
        '先拍完整操作结果，再补一个低门槛或非常规机位的过程镜头，确保动作真的可复现',
        '需要展示软件或手机操作时让屏幕录制成为主画面，讲解人像抠图缩小放在安全区',
        '每一步只保留一个动作和一个短标签，按真实操作顺序逐项点亮',
        '用原始画面、过程画面和结果画面闭环验证，不用纯装饰素材代替证据'
      ],
      generationPrompt: `为竖屏短视频设计原创低门槛实拍教程，主题是“${promptSubject}”。包含非常规但可复现的机位、真实手部操作、手机或软件录屏、步骤标签与前后结果；人物和场景均使用通用原创素材，不复制任何对标的具体视频、设备画面或排版。`
    }
  }

  if (isDenseExplanation) {
    return {
      grammar: 'dense-explainer',
      supportingGrammars: ['spatial-stage'],
      influences: [
        'GenJi：模块化高密度解释（已核验）',
        'Z嗯：多层素材空间与人物尺度变化（已核验）',
        '回天：浅色竖屏信息层级'
      ],
      blendRationale: '以模块化解释承载证据和逻辑，再借空间舞台把主词、关系卡片与口播人物放进同一可读层级。',
      confidence: 'verified',
      semanticReason: '这句包含证据、步骤、原理或可比较的信息，适合用“主关键词 + 模块卡片”的原创高密度解释，让观众一眼看清信息关系。',
      buildSteps: [
        '从句子中提取一个主关键词，作为画面最大字号的视觉锚点',
        '把信息拆成二至四个短模块，分别承载原因、证据、步骤或结论',
        '按口播顺序逐块点亮，当前模块高对比，其余模块降低饱和度但保持可读',
        '用细线、编号或箭头表达模块关系，并为底部字幕和人物安全区留白'
      ],
      generationPrompt: `为竖屏短视频制作原创浅色高密度解释画面，主题是“${promptSubject}”。使用一个主关键词、二至四个模块卡片、清晰编号和关系线；画面现代、克制、可读，不复刻任何对标作品的具体版式、素材或标识。`
    }
  }

  if (isMotivatedTurn) {
    return {
      grammar: 'motivated-montage',
      supportingGrammars: ['editorial-life', 'masked-typography'],
      influences: [
        '南门录像厅：动机组接教学方向（待样片进一步确认）',
        '路过我的生活：关键词节拍与遮罩显隐（已核验）',
        '回天：真实IP生活叙事'
      ],
      blendRationale: '以动作、方向或形状推动语义转折，用真实生活镜头保留可信度，只在转折重音加入短促文字遮罩。',
      confidence: 'provisional',
      semanticReason: '这句承担因果或认知转折，画面应由语义中的动作、方向或形状推动切换，而不是随机套转场；公开资料只验证到组接教学方向，具体独特画面仍需用户样片确认。',
      buildSteps: [
        '提取句子中的转折词以及前后两个核心意象，分别指定一个可拍或可生成的原创镜头',
        '为两个镜头寻找动作方向、主体位置或几何轮廓上的共同点',
        '在动作峰值或关键词落点硬切，必要时用很短的声音先行或延后维持连续性',
        '切换后立即给出新信息，避免用无语义的炫技特效掩盖内容'
      ],
      generationPrompt: `为竖屏短视频设计一组原创动机蒙太奇镜头，表达“${promptSubject}”。前后镜头通过动作方向、主体位置或形状匹配完成语义转折；使用通用人物与场景，不复制对标的具体镜头、人物、音乐或素材。`
    }
  }

  if (isSpatialStage) {
    return {
      grammar: 'spatial-stage',
      supportingGrammars: ['masked-typography', 'editorial-life'],
      influences: [
        'Z嗯：人物抠图或手机框、多层背景与空间尺度变化（已核验）',
        '路过我的生活：重音文字的遮罩节拍（已核验）',
        '回天：真实口播主导的浅色IP叙事'
      ],
      blendRationale: '以口播空间舞台抓住注意力，用少量逐字重音强化观点，再回落到真实人物和生活细节，避免整条视频持续炫技。',
      confidence: 'verified',
      semanticReason: '这句位于开场、身份表达或抽象观点位置，需要通过人物与背景、手机框和信息层的尺度变化，把抽象关系变成可见空间。',
      buildSteps: [
        '从真实口播中抠出人物或放入原创手机框，保持人物边缘自然并避开过度磨皮',
        '背景使用浅色模糊实景、细网格或原创剪辑界面，建立前中后三层空间',
        '随语义改变人物、手机框和素材卡片的大小与位置，让关系变化而非随机漂移',
        '只为一个重音词使用曲面或描边大字，结束后回到标准口播构图与字幕安全区'
      ],
      generationPrompt: `为竖屏个人IP视频制作原创浅色口播空间舞台，主题是“${promptSubject}”。使用通用人物抠图或原创手机框、模糊实景或细网格背景、多层素材卡片、一个曲面或描边大字，并通过人物与画面尺度变化表现语义；不复制任何对标作品的具体人物、界面、字体或构图。`
    }
  }

  if (isRhythmicStatement) {
    return {
      grammar: 'masked-typography',
      supportingGrammars: ['spatial-stage'],
      influences: [
        '路过我的生活：蒙版逐字节奏（已核验）',
        'Z嗯：口播人物与文字的空间尺度变化（已核验）',
        '回天：关键词克制原则'
      ],
      blendRationale: '以逐字蒙版呈现情绪重音，用空间尺度变化让文字与口播人物发生关系，但只处理少量关键词。',
      confidence: 'verified',
      semanticReason: '这句有反差、情绪锚点或短促判断，适合把关键词拆成逐字节拍，并用文字遮罩让语气变化变得可见。',
      buildSteps: [
        '只选二至六个真正承载情绪或反差的字，不把整句都做成动效',
        '将关键词逐字分层，建立实体字、描边副本和低透明度回声三组原创文字层',
        '按口播重音逐字入场，用前景或色块遮罩完成穿越、显隐或黑白状态变化',
        '重音结束后迅速收束回标准字幕，避免动效持续抢占人物表情'
      ],
      generationPrompt: `为竖屏短视频制作原创浅色蒙版文字画面，围绕“${promptSubject}”提取二至六个关键词。使用逐字分层、描边副本、低透明度文字回声和色块遮罩，节奏短促克制，不复刻任何对标的原句、字体组合或具体画面。`
    }
  }

  return {
    grammar: 'editorial-life',
    supportingGrammars: ['spatial-stage'],
    influences: [
      '回天：真实口播与浅色生活编辑叙事',
      'Z嗯：人物和辅助画面的空间层级（已核验）'
    ],
    blendRationale: '以真实人物和生活细节建立信任，只借空间舞台调整人物与辅助素材的层级，不把普通叙事做成满屏动效。',
    confidence: 'generic',
    semanticReason: '这句以个人处境或生活叙事建立信任，适合让真实口播做主画面，再用与当前名词和动作直接相关的浅色生活细节补充语义。',
    buildSteps: [
      '用人物中近景承载核心表达，保留眼神、停顿和真实环境声',
      '从句子中提取一个具体名词或动作，匹配用户自有截图、手部细节或生活 B-roll',
      '辅助画面只覆盖需要解释的短语，随后回到人物，避免长时间失去IP主体',
      '统一使用浅色背景、深色正文和单一强调色，字幕避开人脸与核心物品'
    ],
    generationPrompt: `为竖屏个人IP短视频制作原创浅色生活编辑画面，主题是“${promptSubject}”。以自然口播人物为主，补充手部、桌面、通勤或工作细节，使用真实克制的构图和单一强调色，不模仿任何具体创作者的可识别画面。`
  }
}

function planSignature(plan: VisualPlan): string {
  return [plan.grammar, ...plan.supportingGrammars].join('|')
}

function diversifyVisualPlan(plan: VisualPlan, index: number, recentSignatures: string[]): VisualPlan {
  const signature = planSignature(plan)
  if (recentSignatures.at(-1) !== signature || recentSignatures.at(-2) !== signature) return plan

  const rotation: VisualPlan['grammar'][] = [
    'spatial-stage',
    'editorial-life',
    'masked-typography',
    'dense-explainer',
    'practical-demo',
    'motivated-montage',
    'photo-transformation'
  ]
  const alternative = rotation
    .slice(index % rotation.length)
    .concat(rotation.slice(0, index % rotation.length))
    .find((grammar) => grammar !== plan.grammar && !plan.supportingGrammars.includes(grammar))
  if (!alternative) return plan

  const supportingGrammars = plan.supportingGrammars.length >= 2
    ? [plan.supportingGrammars[0], alternative]
    : [...plan.supportingGrammars, alternative]
  return {
    ...plan,
    supportingGrammars,
    influences: [...new Set([...plan.influences, '回天：连续镜头去重复策略'])],
    blendRationale: `${plan.blendRationale} 为避免连续三镜使用同一组合，本镜加入 ${alternative} 作为轻量辅助，但不改变主语义方法。`
  }
}

export function fallbackStoryboard(project: Project): StoryboardShot[] {
  const script = project.scriptVersions.find((item) => item.id === project.activeScriptId) ?? project.scriptVersions.at(-1)
  if (!script) return []
  const talkingHead = project.assets.find((asset) => asset.kind === 'talking-head')
  const supporting = project.assets.filter((asset) => ['screenshot', 'image', 'video', 'screen-recording'].includes(asset.kind))
  const recentPlanSignatures: string[] = []
  return script.sentences.map((sentence, index) => {
    const visualPlan = diversifyVisualPlan(visualPlanFor(sentence, index), index, recentPlanSignatures)
    recentPlanSignatures.push(planSignature(visualPlan))
    const useSupporting = supporting.length > 0 && ['evidence', 'story', 'benefit'].includes(sentence.role) && index % 2 === 0
    const useQuoteCard = sentence.role === 'turn'
      || (!talkingHead && !useSupporting && ['loss', 'emotion'].includes(sentence.role) && index % 3 === 0)
    const grammarNeedsOriginalCutaway = ['dense-explainer', 'photo-transformation', 'practical-demo'].includes(visualPlan.grammar)
    const mayGenerateAroundTalkingHead = project.assetPolicy !== 'owned-only'
      && (grammarNeedsOriginalCutaway || (project.assetPolicy === 'auto-first' && index % 2 === 1))
    const useGeneratedVisual = !useSupporting && !useQuoteCard && (!talkingHead || mayGenerateAroundTalkingHead)
    const asset = useSupporting ? supporting[index % supporting.length] : useQuoteCard || useGeneratedVisual ? undefined : talkingHead
    const visualType: StoryboardShot['visualType'] = useQuoteCard
      ? 'quote-card'
      : useGeneratedVisual
        ? 'ai-visual'
        : useSupporting
      ? asset?.kind === 'screenshot'
        ? 'screenshot'
        : 'b-roll'
        : 'talking-head'
    return {
      id: id(),
      order: index,
      sentenceIds: [sentence.id],
      scriptText: sentence.text,
      duration: sentence.estimatedSeconds,
      visualType,
      visualDirection: visualType === 'screenshot'
        ? '截图居中进入，轻微推近并高亮与当前句有关的位置'
        : visualType === 'quote-card'
          ? '短暂离开口播画面，用原创观点卡完成认知转折；只保留一个视觉焦点'
          : visualType === 'ai-visual'
            ? '根据当前句生成原创编辑视觉，使用抽象隐喻和层次构图，不伪造真实事件'
          : visualType === 'b-roll'
            ? '画面服务当前语义，不抢人物表达'
            : index === 0
              ? '人物中近景，开头轻推近，保持眼神和真实表情'
              : '保持人物主体，关键词出现时轻微构图变化',
      assetId: asset?.id,
      subtitle: sentence.text,
      motion: visualType === 'screenshot'
        ? '遮罩揭示 + 局部推近 + 重点框选'
        : visualType === 'talking-head'
          ? index === 0 ? '开场 2% 快推后稳定' : sentence.role === 'cta' ? '镜头稳定并留出行动停顿' : '按语义轻微重构构图'
          : visualType === 'quote-card'
            ? '观点词先出现，正文随后落定；进场快、离场更快'
            : '前景与背景不同速轻移，避免持续单一缩放',
      transition: index === 0
        ? '直接开场'
        : visualType === 'quote-card'
          ? '短促压暗切换'
          : visualType === 'screenshot'
            ? '方向性遮罩切入'
            : sentence.role === 'cta'
              ? '回切人物近景'
              : '动作连续硬切',
      visualPlan,
      locked: false
    }
  })
}
