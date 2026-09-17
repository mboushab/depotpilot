import { expect, test } from "@playwright/test";

test("admin can sign in and browse core modules", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.DEMO_ADMIN_EMAIL ?? "admin@boxpilot.local");
  await page.getByLabel("Mot de passe").fill(process.env.DEMO_ADMIN_PASSWORD ?? "BoxPilot!2026");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await page.getByRole("link", { name: "Box", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Box de stockage" })).toBeVisible();
  await page.getByRole("link", { name: "Clients" }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Factures" }).click();
  await expect(page.getByRole("heading", { name: "Factures", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Parking" }).click();
  await expect(page.getByRole("heading", { name: "Parking", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Chargements" }).click();
  await expect(page.getByRole("heading", { name: "Planning des chargements", exact: true })).toBeVisible();
});
