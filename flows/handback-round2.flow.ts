import { flow } from "bx/flow";

export default flow("Second playtest: guide, tips, overview and selection", async b => {
  await b.open("http://localhost:5173");
  await b.js('(() => { for (const key of ["solstice-help-seen", "solstice-skip-help", "solstice-hide-tips"]) localStorage.removeItem(key); sessionStorage.removeItem("solstice-reconnection"); })()');
  await b.open("http://localhost:5173");
  await b.fill("Your callsign", "Round 2 QA");
  await b.click("Join the universe");
  await b.expectVisible(".manual-modal");
  await b.expectNotVisible(".server-note");
  await b.expectText("Repair & upgrade");
  await b.click("Start playing");
  await b.drive("void 0", "window.__solsticeDebug?.player > 0", { timeoutMs: 10000 });
  await b.click("Dismiss playing tips");
  await b.expectNotVisible(".objective-panel");
  await b.drive("void 0", "(() => { const d=window.__solsticeDebug,h=d.world.stars.find(s=>s.owner===d.player); return h && Math.hypot(d.view.x-h.x,d.view.y-h.y)<1 && Math.abs(d.view.height-(innerWidth<700?1700:1550))<1; })()", { timeoutMs: 20000 });
  await b.js("window.__round2View = {...window.__solsticeDebug.view}");
  await b.click("View whole galaxy");
  await b.drive("void 0", "window.__solsticeDebug.view.height > 14000", { timeoutMs: 20000 });
  await b.snap("artifacts/bx-round2-overview.png");
  await b.click("Return to previous view");
  await b.drive("void 0", "(() => {const a=window.__round2View,b=window.__solsticeDebug.view;return Math.abs(a.height-b.height)<5 && Math.hypot(a.x-b.x,a.y-b.y)<5})()", { timeoutMs: 20000 });
  await b.click("Select all");
  await b.drive("void 0", "window.__solsticeDebug.selected.length > 0", { timeoutMs: 3000 });
  await b.snap("artifacts/bx-round2-selection.png");
  await b.open("http://localhost:5173");
  await b.click("Join the universe");
  await b.drive("void 0", "window.__solsticeDebug?.player > 0", { timeoutMs: 10000 });
  await b.expectNotVisible(".objective-panel");
  await b.click("Settings");
  await b.click("Playing tips");
  await b.click("Close dialog");
  await b.expectVisible(".objective-panel");
  await b.click("Settings");
  await b.click("Leave this universe");
  await b.click("Leave universe");
});

