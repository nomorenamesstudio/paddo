import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('http://127.0.0.1:4319/')
const atLoad = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  setting: document.documentElement.dataset.themeSetting,
  attrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`),
  hasInlineScript: document.head.innerHTML.includes('paddo-theme'),
  localStorage: window.localStorage.getItem('paddo-theme'),
}))
await page.waitForTimeout(1200)
const later = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  setting: document.documentElement.dataset.themeSetting,
  attrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`),
}))
console.log(JSON.stringify({ atLoad, later }, null, 2))
await browser.close()
