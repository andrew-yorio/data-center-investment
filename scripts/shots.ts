// Usage: node scripts/shots.ts <baseUrl> <outDir> [--reduced] [--intro]
// Captures each section at 1440 / 768 / 375 px widths.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:4173", out = "reports/shots"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reduced = process.argv.includes("--reduced");
const introOnly = process.argv.includes("--intro");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const width of [1440, 768, 375]) {
  const height = width === 375 ? 812 : width === 768 ? 1024 : 900;
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
  page.on("console", (m) => m.type() === "error" && console.log(`[${width}] console error: ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[${width}] page error: ${e.message}`));
  await page.goto(`${base}/?force3d`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const tag = reduced ? `${width}-reduced` : `${width}`;
  if (introOnly) {
    const track = await page.evaluate(() => {
      const el = document.getElementById("intro")!;
      return { top: el.offsetTop, h: el.offsetHeight };
    });
    for (const p of [0, 0.1, 0.2, 0.3, 0.5, 0.66, 0.78, 0.9, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), track.top + (track.h - height) * p);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${out}/${tag}-intro-${String(p).replace(".", "")}.png` });
    }
  } else {
    await page.screenshot({ path: `${out}/${tag}-0-top.png` });
    for (const id of ["how-it-works", "risks", "faq", "signup"]) {
      await page.evaluate((i) => document.getElementById(i)!.scrollIntoView({ block: "start" }), id);
      await page.waitForTimeout(600);
      await page.locator(`#${id}`).screenshot({ path: `${out}/${tag}-${id}.png` });
    }
    await page.locator("footer").screenshot({ path: `${out}/${tag}-footer.png` });
  }
  await page.close();
}
await browser.close();
console.log("done");
