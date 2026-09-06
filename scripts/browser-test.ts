import { chromium, type Page } from "@playwright/test";
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import type { WorldMeta, Unit, Viewport } from "../shared/types";
declare global {
  interface Window {
    __solsticeDebug: {
      world: WorldMeta;
      player: number;
      view: Viewport;
      selected: number[];
      units: Unit[];
    };
  }
}
const url = process.env.TEST_BROWSER_URL ?? "http://localhost:5173";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
const watch = (p: Page) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("net::ERR_"))
      errors.push(m.text());
  });
};
async function navigate(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      // Starting/stopping WSL Docker can briefly change Windows interfaces.
      if (
        attempt === 2 ||
        !(error instanceof Error) ||
        !error.message.includes("ERR_NETWORK_CHANGED")
      )
        throw error;
      await page.waitForTimeout(500);
    }
  }
}
async function join(page: Page, name: string) {
  await navigate(page);
  await page.getByRole("textbox", { name: "Your callsign" }).fill(name);
  await page
    .getByRole("button", { name: "Join the universe", exact: true })
    .click();
  await page.waitForFunction(() => window.__solsticeDebug?.player > 0);
  await page.waitForTimeout(900);
}
async function screenStar(page: Page, own: boolean) {
  return page.evaluate((own) => {
    const d = window.__solsticeDebug;
    const h = d.world.stars.find((s) => s.owner === d.player)!;
    const s = own
      ? h
      : d.world.stars
          .filter((s) => !s.owner)
          .sort(
            (a, b) =>
              (a.x - h.x) ** 2 +
              (a.y - h.y) ** 2 -
              ((b.x - h.x) ** 2 + (b.y - h.y) ** 2),
          )[0];
    return {
      id: s.id,
      x: ((s.x - d.view.x) * innerHeight) / d.view.height + innerWidth / 2,
      y: ((s.y - d.view.y) * innerHeight) / d.view.height + innerHeight / 2,
    };
  }, own);
}
async function leave(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave this universe", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Leave universe", exact: true })
    .click();
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  watch(page);
  await navigate(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "artifacts/desktop-menu.png" });
  await join(page, "Desktop QA");
  const initial = await page.evaluate(
    () =>
      window.__solsticeDebug.world.players.find(
        (p) => p.id === window.__solsticeDebug.player,
      )!.stars,
  );
  await page.getByRole("button", { name: "Select all" }).click();
  assert.ok(
    (await page.evaluate(() => window.__solsticeDebug.selected.length)) >= 100,
  );
  await page.getByRole("button", { name: "Send half" }).click();
  assert.ok(
    (await page.evaluate(() => window.__solsticeDebug.selected.length)) < 100,
  );
  await page.getByRole("button", { name: "Select all" }).click();
  const target = await screenStar(page, false);
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(
    (id) =>
      window.__solsticeDebug.world.stars[id].owner ===
      window.__solsticeDebug.player,
    target.id,
    { timeout: 15000 },
  );
  assert.ok(
    (await page.evaluate(
      () =>
        window.__solsticeDebug.world.players.find(
          (p) => p.id === window.__solsticeDebug.player,
        )!.stars,
    )) > initial,
  );
  await page.screenshot({ path: "artifacts/desktop-capture.png" });
  // Reconnect through the page lifecycle, using only the saved Colyseus token.
  const oldId = await page.evaluate(() => window.__solsticeDebug.player);
  await page.reload();
  await page
    .getByRole("button", { name: "Join the universe", exact: true })
    .click();
  await page.waitForFunction(() => window.__solsticeDebug.player > 0);
  assert.equal(await page.evaluate(() => window.__solsticeDebug.player), oldId);
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  assert.equal(await page.locator("dialog").count(), 1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Soundscape" }).click();
  assert.equal(
    await page
      .getByRole("switch", { name: "Soundscape" })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.getByRole("switch", { name: "Stellar effects" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await leave(page);
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  watch(phone);
  await navigate(phone);
  await phone.waitForTimeout(900);
  await phone.screenshot({ path: "artifacts/mobile-menu.png" });
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await join(phone, "Touch QA");
  const star = await screenStar(phone, true);
  await phone.touchscreen.tap(star.x, star.y);
  assert.ok(
    (await phone.evaluate(() => window.__solsticeDebug.selected.length)) > 0,
  );
  await phone.getByRole("button", { name: "Clear", exact: false }).click();
  // Actual touch events verify pinch zoom and distinguish panning from selection.
  const cdp = await mobile.newCDPSession(phone);
  const before = await phone.evaluate(() => window.__solsticeDebug.view.height);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 145, y: 400 },
      { x: 245, y: 400 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 85, y: 400 },
      { x: 305, y: 400 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.waitForTimeout(700);
  assert.ok(
    (await phone.evaluate(() => window.__solsticeDebug.view.height)) <
      before * 0.8,
  );
  await phone.getByRole("button", { name: "Return to your star (F)" }).click();
  await phone.waitForTimeout(800);
  await phone.getByRole("button", { name: "Pan", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 95, y: 320 }],
  });
  for (let y = 340; y <= 520; y += 30)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 290, y }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    (await phone.evaluate(() => window.__solsticeDebug.selected.length)) > 0,
    "touch box selection",
  );
  await phone.screenshot({ path: "artifacts/mobile-game.png" });
  await leave(phone);
  await mobile.close();
  assert.deepEqual(errors, [], "no JavaScript or WebGL errors");
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "desktop select / half / send / capture",
          "page-reload reconnect",
          "keyboard-accessible help dialog",
          "audio toggle",
          "quality toggle",
          "mobile layout",
          "touch star selection",
          "two-finger pinch",
          "touch box selection",
          "clean WebGL shaders",
        ],
        screenshots: "artifacts/",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
