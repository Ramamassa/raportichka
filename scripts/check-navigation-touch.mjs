import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Uses real browser touch input (not dispatchEvent/mocked pointer handlers).
const url = process.argv[2];
if (!url) throw new Error('Pass the running project URL');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('.nav button[aria-current="page"]').waitFor();
  const cdp = await context.newCDPSession(page);
  const centre = async screen => {
    const box = await page.locator(`.nav [data-screen="${screen}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const lens = () => page.locator('.nav-indicator').evaluate(el => ({ x: el.getBoundingClientRect().x, colour: el.style.getPropertyValue('--nav-colour') }));
  async function drag(from, to) {
    const a = await centre(from), b = await centre(to), before = await lens();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
    let middle;
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 12, y: a.y, id: 1 }] });
      await page.waitForTimeout(16);
      if (i === 6) middle = await lens();
    }
    assert.ok(Math.abs(middle.x - before.x) > 20, 'lens must follow touch before release');
    assert.notEqual(middle.colour, before.colour, 'colour changes during touch');
    assert.equal(await page.locator('.nav [aria-current="page"]').getAttribute('data-screen'), from, 'screen changes only on release');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.nav [aria-current="page"]').getAttribute('data-screen'), to);
    console.log(`PASS touch drag ${from} -> ${to}: intermediate movement, colour and release selection`);
  }
  await drag('today', 'group');
  await drag('group', 'sheet');
  await drag('sheet', 'today');
  await page.getByRole('button', { name: 'Ведомость', exact: true }).tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.nav [aria-current="page"]').getAttribute('data-screen'), 'sheet');
  console.log('PASS ordinary tap after drag');
  await page.getByRole('button', { name: 'Отметки', exact: true }).click();
  await page.getByRole('heading', { name: 'Кто сегодня на паре?', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ведомость', exact: true }).click();
  await page.getByRole('heading', { name: 'Ведомость пропусков', exact: true }).waitFor();
  console.log('PASS mouse clicks and visible destination headings');
  const desktop = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(url);
  await desktopPage.locator('.nav button[aria-current="page"]').waitFor();
  await desktopPage.getByRole('button', { name: 'Ведомость', exact: true }).click();
  await desktopPage.getByRole('heading', { name: 'Ведомость пропусков', exact: true }).waitFor();
  console.log('PASS fresh desktop-context click');
  await desktop.close();
  assert.deepEqual(errors, []);
  console.log('PASS no page errors');
} finally {
  await browser.close();
}
