import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

await mkdir(resolve('build'), { recursive: true })
let application

try {
  application = await electron.launch({ args: ['.'] })
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => {
    document.head.innerHTML = `<style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: transparent; }
      #icon { width: 512px; height: 512px; }
      svg { display: block; width: 512px; height: 512px; }
    </style>`
    document.body.innerHTML = `
      <div id="icon">
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="background" x1="70" y1="30" x2="450" y2="480" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FFB15F"/>
              <stop offset="1" stop-color="#FF6E12"/>
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#FF6E12" flood-opacity=".24"/>
            </filter>
          </defs>
          <rect width="512" height="512" rx="112" fill="#0A0D12"/>
          <rect x="42" y="42" width="428" height="428" rx="96" fill="url(#background)" filter="url(#shadow)"/>
          <g fill="#1B0C03">
            <rect x="130" y="228" width="252" height="170" rx="30"/>
            <path d="M118 179.5c-3.7-15.5 5.9-31.1 21.4-34.8l213.9-50.9c15.5-3.7 31.1 5.9 34.8 21.4l10.4 43.8L128.4 223.3 118 179.5Z"/>
          </g>
          <g stroke="#FF9B43" stroke-width="21" stroke-linecap="round">
            <path d="M178 139l-23 61"/>
            <path d="M258 120l-23 61"/>
            <path d="M338 101l-23 61"/>
          </g>
          <path d="M205 283h102c15.5 0 28 12.5 28 28v4c0 15.5-12.5 28-28 28H205c-15.5 0-28-12.5-28-28v-4c0-15.5 12.5-28 28-28Z" fill="#FF8A2A"/>
          <circle cx="403" cy="95" r="55" fill="#121820"/>
          <path d="M403 61c2 21 13 32 34 34-21 2-32 13-34 34-2-21-13-32-34-34 21-2 32-13 34-34Z" fill="#FFF"/>
          <circle cx="444" cy="55" r="8" fill="#FF9B43"/>
        </svg>
      </div>`
  })
  await page.locator('#icon').screenshot({ path: resolve('build', 'icon.png') })
  console.log(resolve('build', 'icon.png'))
} finally {
  if (application) await application.close()
}
