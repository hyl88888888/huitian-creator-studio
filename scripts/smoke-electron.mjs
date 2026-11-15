import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

const artifacts = resolve('artifacts')
await mkdir(artifacts, { recursive: true })

let application

try {
  application = await electron.launch(
    process.env.HUITIAN_EXECUTABLE
      ? { executablePath: process.env.HUITIAN_EXECUTABLE }
      : { args: ['.'] }
  )
  const page = await application.firstWindow()
  const errors = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(700)
  await page.screenshot({ path: resolve(artifacts, 'dashboard.png'), fullPage: true })

  const title = await page.title()
  const bodyText = await page.locator('body').innerText()
  if (!bodyText.includes('把想法，变成观众')) {
    throw new Error('首页核心内容没有正常渲染。')
  }

  await page.locator('.sidebar__item').filter({ hasText: '设置' }).click()
  await page.getByRole('heading', { name: '设置', exact: true }).waitFor()
  const capabilitySwitches = page.locator('.capability-switch input[type="checkbox"]')
  if (await capabilitySwitches.count() !== 2) {
    throw new Error('设置页没有保持为两个主要能力开关。')
  }
  if (await capabilitySwitches.nth(0).isChecked() || await capabilitySwitches.nth(1).isChecked()) {
    throw new Error('联网创作或自动补画默认开启，可能造成意外费用。')
  }
  await capabilitySwitches.nth(1).check({ force: true })
  if (!await capabilitySwitches.nth(0).isChecked() || !await capabilitySwitches.nth(1).isChecked()) {
    throw new Error('开启自动补画时没有同步开启所需的联网创作能力。')
  }
  await capabilitySwitches.nth(0).uncheck({ force: true })
  if (await capabilitySwitches.nth(0).isChecked() || await capabilitySwitches.nth(1).isChecked()) {
    throw new Error('关闭联网创作时没有同步关闭自动补画。')
  }
  await page.screenshot({ path: resolve(artifacts, 'settings-simple.png'), fullPage: true })
  await page.locator('.sidebar__item').filter({ hasText: '创作项目' }).click()
  await page.getByText('把想法，变成观众').waitFor()

  await page.getByRole('button', { name: '开始一次新创作' }).click()
  await page.getByRole('heading', { name: '你想做一条什么内容？' }).waitFor()

  const advancedPanel = page.locator('.advanced-setup')
  const expandAdvanced = page.getByRole('button', { name: /展开高级设置/ })
  if (await advancedPanel.count() !== 0) {
    throw new Error('高级设置应在进入创作页时默认隐藏。')
  }
  if (!await expandAdvanced.isVisible()) {
    throw new Error('没有找到“展开高级设置”入口。')
  }
  if (await page.locator('.mode-picker > button').count() !== 0) {
    throw new Error('高级设置收起时仍渲染了复杂模式选项。')
  }
  await page.screenshot({ path: resolve(artifacts, 'project-setup-simple.png'), fullPage: true })

  await expandAdvanced.click()
  await advancedPanel.waitFor({ state: 'visible' })
  const modes = await page.locator('.mode-picker > button').count()
  if (modes !== 3) throw new Error(`展开后创作模式数量异常：${modes}`)
  await page.screenshot({ path: resolve(artifacts, 'project-setup-advanced.png'), fullPage: true })

  await page.getByRole('button', { name: /收起高级设置/ }).click()
  if (await advancedPanel.count() !== 0) {
    throw new Error('点击收起后，高级设置仍然存在。')
  }

  const primaryInput = page.locator('.quick-composer__input')
  const brief = '我想做一条个人IP口播：普通人不是没有内容，而是总觉得自己的经历不值得讲。请从人性角度出发，让每句话都和观众有关，开头有冲突，结尾让人想关注；口语化，不说空话。'
  await primaryInput.fill(brief)
  if (await primaryInput.inputValue() !== brief) {
    throw new Error('极简首屏主输入没有正确保存用户内容。')
  }

  await page.getByRole('button', { name: '一键开始创作' }).click()
  await page.getByRole('heading', { name: '先确认：软件有没有真正听懂' }).waitFor({ timeout: 30_000 })
  const activeStep = (await page.locator('.stepper button.is-active').innerText()).trim()
  if (!activeStep.includes('理解要求')) {
    throw new Error(`一键开始后没有进入“理解要求”：${activeStep}`)
  }
  await page.screenshot({ path: resolve(artifacts, 'requirement-understanding.png'), fullPage: true })

  await page.getByRole('button', { name: '确认理解，生成创作蓝图' }).click()
  await page.getByRole('heading', { name: '先定结构，再开始写正文' }).waitFor({ timeout: 30_000 })
  await page.screenshot({ path: resolve(artifacts, 'creative-blueprint.png'), fullPage: true })

  await page.getByRole('button', { name: '确认蓝图并写文案' }).click()
  await page.getByRole('heading', { name: '逐句写，也逐句验收' }).waitFor({ timeout: 60_000 })
  await page.screenshot({ path: resolve(artifacts, 'script-editor.png'), fullPage: true })

  const sentenceCount = await page.locator('.sentence-card').count()
  if (sentenceCount < 5) throw new Error(`生成的文案句数异常：${sentenceCount}`)

  await page.getByRole('button', { name: '文案满意，生成分镜' }).click()
  await page.getByRole('heading', { name: '画面服务表达，不抢走表达' }).waitFor({ timeout: 30_000 })
  await page.screenshot({ path: resolve(artifacts, 'storyboard.png'), fullPage: true })

  const shotCount = await page.locator('.shot-card').count()
  if (shotCount !== sentenceCount) {
    throw new Error(`分镜与文案句数不一致：${shotCount}/${sentenceCount}`)
  }

  await page.getByRole('button', { name: '进入预览与导出' }).click()
  await page.getByRole('heading', { name: '一份成片，一份可以继续改的交付包' }).waitFor({ timeout: 30_000 })
  await page.screenshot({ path: resolve(artifacts, 'export.png'), fullPage: true })

  if (errors.length) throw new Error(`渲染器错误：${errors.join(' | ')}`)

  console.log(JSON.stringify({
    ok: true,
    title,
    advancedHiddenByDefault: true,
    modes,
    activeStepAfterOneClick: activeStep,
    sentenceCount,
    shotCount,
    screenshots: [
      'artifacts/dashboard.png',
      'artifacts/settings-simple.png',
      'artifacts/project-setup-simple.png',
      'artifacts/project-setup-advanced.png',
      'artifacts/requirement-understanding.png',
      'artifacts/creative-blueprint.png',
      'artifacts/script-editor.png',
      'artifacts/storyboard.png',
      'artifacts/export.png'
    ]
  }))
} finally {
  if (application) await application.close()
}
