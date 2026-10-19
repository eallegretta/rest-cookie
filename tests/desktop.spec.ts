import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

test("desktop route CRUD and shared cookies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rest-cookie-desktop-"));
  const server = createServer((req, res) => {
    if (req.url === "/login")
      res.setHeader("Set-Cookie", "auth=hello; Path=/; HttpOnly");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        cookies: req.headers.cookie || "",
        message: "Hello from your API",
        header: req.headers["x-shared"],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, REST_COOKIE_DATA_DIR: dir },
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Save route", exact: true })
      .waitFor();
    await expect(page.getByLabel("Request timeout (seconds)")).toHaveValue(
      "30",
    );
    await page.getByRole("button", { name: /^Variables/ }).click();
    await page.getByRole("button", { name: "Add variable" }).click();
    await page.getByLabel("Variable name 1", { exact: true }).fill("BASE_URL");
    await page.getByLabel("Variable value 1", { exact: true }).fill(base);
    await page
      .getByRole("button", { name: "Save variables", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Variables", exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /^Variables/ }).click();
    await expect(
      page.getByLabel("Variable value 1", { exact: true }),
    ).toHaveValue(base);
    await page
      .getByLabel("New environment name", { exact: true })
      .fill("Staging");
    await page
      .getByRole("button", { name: "Add environment", exact: true })
      .click();
    await expect(
      page.getByLabel("Edit environment", { exact: true }),
    ).not.toHaveValue("default");
    await page
      .getByRole("button", { name: "Override BASE_URL", exact: true })
      .click();
    await page
      .getByLabel("Variable value 1", { exact: true })
      .fill(`${base}/staging`);
    await page
      .getByRole("button", { name: "Save variables", exact: true })
      .click();
    await expect(
      page.getByLabel("Environment", { exact: true }).locator("option:checked"),
    ).toHaveText("Staging");
    await page.reload();
    await expect(page.getByLabel("Environment", { exact: true })).toHaveValue(
      "default",
    );
    await page
      .getByLabel("Environment", { exact: true })
      .selectOption({ label: "Staging" });
    await page.getByLabel("Request URL").fill("${BASE_URL}/echo");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".response-url")).toHaveText(
      `${base}/staging/echo`,
    );
    await page
      .getByLabel("Environment", { exact: true })
      .selectOption("default");

    await page.getByRole("button", { name: /^Global headers/ }).click();
    const globalDialog = page.getByRole("dialog", {
      name: "Global headers",
      exact: true,
    });
    await globalDialog.getByRole("button", { name: "Add header" }).click();
    await globalDialog
      .getByLabel("Header name", { exact: true })
      .fill("X-Shared");
    await globalDialog
      .getByLabel("Header value", { exact: true })
      .fill("global-value");
    await globalDialog
      .getByRole("button", { name: "Save global headers", exact: true })
      .click();
    await expect(globalDialog).not.toBeVisible();
    await page.getByLabel("Route name", { exact: true }).fill("Sign in");
    await page.getByLabel("Request URL").fill("${BASE_URL}/login");
    await page.getByRole("button", { name: "Save route", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Route saved");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".response-meta")).toContainText("200");
    await expect(page.locator("pre")).toContainText('"header": "global-value"');
    await page.getByRole("button", { name: "Add header" }).click();
    await page.getByLabel("Header name", { exact: true }).fill("x-shared");
    await page
      .getByLabel("Header value", { exact: true })
      .fill("request-value");
    await page.getByRole("button", { name: "Save route", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Route saved");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("pre")).toContainText(
      '"header": "request-value"',
    );
    await page
      .getByRole("button", { name: "＋ New request", exact: true })
      .click();
    await page
      .getByLabel("Route name", { exact: true })
      .fill("Current session");
    await expect(page.getByLabel("Request timeout (seconds)")).toHaveValue(
      "30",
    );
    await page.getByLabel("Request timeout (seconds)").fill("60");
    await page.getByLabel("Request URL").fill("${BASE_URL}/echo");
    await page.getByRole("button", { name: "Save route", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Route saved");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("pre")).toContainText("auth=hello");
    await page
      .getByLabel("Route name", { exact: true })
      .fill("Inspect session");
    await page.getByRole("button", { name: "Save route", exact: true }).click();
    await expect(page.locator("nav")).toContainText("Inspect session");
    await page.reload();
    await page
      .getByRole("button", { name: "GET Inspect session", exact: true })
      .click();
    await expect(page.getByLabel("Route name", { exact: true })).toHaveValue(
      "Inspect session",
    );
    await expect(page.getByLabel("Request URL")).toHaveValue(
      "${BASE_URL}/echo",
    );
    await expect(page.getByLabel("Request timeout (seconds)")).toHaveValue(
      "60",
    );
    await page.screenshot({ path: "/private/tmp/rest-cookie-desktop.png" });
    await page.getByRole("button", { name: /Cookie jar/ }).click();
    await expect(page.locator(".cookie")).toContainText("auth");
    await page
      .getByRole("button", { name: "Clear all cookies", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear cookies", exact: true })
      .click();
    await expect(page.locator(".no-cookies")).toContainText(
      "Your jar is empty",
    );
    await page.getByText("Add custom cookie", { exact: true }).click();
    await page.getByLabel("Cookie name", { exact: true }).fill("manual");
    await page
      .getByLabel("Cookie value", { exact: true })
      .fill("custom-session");
    await page.getByLabel("Cookie domain", { exact: true }).fill("127.0.0.1");
    await page
      .getByLabel("Cookie expiration date", { exact: true })
      .fill("2099-12-31T12:00");
    await page.getByLabel("HttpOnly", { exact: true }).check();
    await page
      .getByRole("button", { name: "Save cookie", exact: true })
      .click();
    await expect(page.locator(".cookie")).toContainText("custom-session");
    await expect(page.locator(".cookie")).toContainText("HttpOnly");
    await page.getByRole("button", { name: "Close cookie jar" }).click();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("pre")).toContainText(
      '"cookies": "manual=custom-session"',
    );
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete route", exact: true })
      .click();
    await expect(page.locator("nav")).not.toContainText("Inspect session");
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
