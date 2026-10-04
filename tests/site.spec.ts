import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WRANGLER_LOG = process.env.WRANGLER_LOG ?? "/tmp/claude-1000/wrangler.log";
const sql = (q: string) => execSync(`docker exec dci-pg psql -U postgres -tAc "${q}"`).toString().trim();

async function fillForm(page: Page, email: string, name = "Grace Hopper") {
  await page.goto("/#signup");
  const form = page.locator("#signup form");
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("How much might you invest?").selectOption("2500_10000");
  await form.getByLabel("I understand this is a non-binding indication of interest.").check();
  // Turnstile's test site key auto-solves; wait for the token to land.
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  sql("delete from signups; delete from signup_attempts;");
});

test("sign up, land in the database with an IP, and confirm by email link", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await fillForm(page, email);
  await page.getByRole("button", { name: "Join the list" }).last().click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const row = sql(`select ip_address is not null, confirmed, investment_range, acknowledged_nonbinding from signups where email='${email}'`);
  expect(row).toBe("t|f|2500_10000|t");

  const log = readFileSync(WRANGLER_LOG, "utf8");
  const link = [...log.matchAll(new RegExp(`to=${email} confirm=(\\S+)`, "g"))].pop()?.[1];
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole("status").filter({ hasText: "Your email is confirmed" })).toBeVisible();
  expect(page.url()).not.toContain("confirmed=");
  expect(sql(`select confirmed, confirmed_at is not null from signups where email='${email}'`)).toBe("t|t");

  // A second click reports "already confirmed".
  await page.goto(link!);
  await expect(page.getByRole("status").filter({ hasText: "already confirmed" })).toBeVisible();

  // Duplicate (different case) shows the same success message and adds no row.
  await fillForm(page, email.toUpperCase());
  await page.getByRole("button", { name: "Join the list" }).last().click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(sql(`select count(*) from signups where lower(email)=lower('${email}')`)).toBe("1");
});

test("inline validation blocks an empty submit and focuses the first problem", async ({ page }) => {
  await page.goto("/#signup");
  await page.getByRole("button", { name: "Join the list" }).last().click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Please choose a range.", { exact: false })).toBeVisible();
  await expect(page.getByText("Please confirm you understand this is non-binding.")).toBeVisible();
  await expect(page.locator("#signup form").getByLabel("Name")).toBeFocused();
  await expect(page.locator("#signup form").getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
});

test("hard rules: no payment fields, no banned phrases, disclaimer near form and in footer", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const banned of ["guaranteed return", "risk-free", "passive income", "invest today", "buy in", "reserve your spot", "%"]) {
    expect(text, banned).not.toContain(banned);
  }
  expect(await page.locator('input[autocomplete^="cc-"], input[name*="card" i], input[name*="ssn" i]').count()).toBe(0);
  const disclaimer = "No money or other consideration is being solicited";
  await expect(page.locator("#signup").getByText(disclaimer)).toBeVisible();
  await expect(page.locator("footer").getByText(disclaimer)).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Privacy policy" })).toBeVisible();
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`axe: no WCAG 2.1 A/AA violations (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("iframe").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("axe: privacy page", async ({ page }) => {
  await page.goto("/privacy.html");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
