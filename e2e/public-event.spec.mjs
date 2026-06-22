import { test, expect, devices } from "@playwright/test";
import {
  admin,
  createTestUser,
  trackEvent,
  iso,
  daysFromNow,
  cleanup,
} from "../tests/harness.mjs";

let pollEventId;
let smartEventId;
const guestEmails = [];

async function createPoll(host) {
  const o1s = daysFromNow(3);
  const o2s = daysFromNow(4);
  const res = await host.client.rpc("create_poll_event", {
    p_title: "E2E poll dinner",
    p_description: null,
    p_scheduling_deadline: iso(daysFromNow(1)),
    p_min_votes: null,
    p_options: [
      { starts_at: iso(o1s), ends_at: iso(new Date(o1s.getTime() + 3_600_000)) },
      { starts_at: iso(o2s), ends_at: iso(new Date(o2s.getTime() + 3_600_000)) },
    ],
  });
  if (res.error) throw new Error(res.error.message);
  trackEvent(res.data.event_room_id);
  return res.data.event_room_id;
}

async function createSmart(host) {
  const res = await host.client.rpc("create_smart_event", {
    p_title: "E2E smart dinner",
    p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
    p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
    p_scheduling_deadline: iso(daysFromNow(1)),
    p_slots: [{ day_of_week: 1, start_time: "18:00", duration_minutes: 60 }],
    p_min_synced_users: null,
    p_timezone: "UTC",
  });
  if (res.error) throw new Error(res.error.message);
  trackEvent(res.data.event_room_id);
  return res.data.event_room_id;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const host = await createTestUser("E2EHost");
  pollEventId = await createPoll(host);
  smartEventId = await createSmart(host);
});

test.afterAll(async () => {
  // Remove guests created through the browser (web-rsvp), then the seeds.
  for (const email of guestEmails) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (data?.id) {
      await admin.from("profiles").delete().eq("id", data.id);
      await admin.auth.admin.deleteUser(data.id).catch(() => {});
    }
  }
  await cleanup();
});

test("new guest can RSVP to a smart event (no calendar sync)", async ({ page }) => {
  const email = `e2e-${Date.now()}-smart@grapple.test`;
  guestEmails.push(email);

  await page.goto(`/event/${smartEventId}`);
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await page.getByPlaceholder("First name").fill("Ella");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/password/i).fill("Test123456!");

  const sync = page.getByRole("checkbox");
  if (await sync.isChecked()) await sync.uncheck(); // avoid the Google redirect

  await page.getByRole("button", { name: "Count me in" }).click();
  await expect(page.getByText("You're in!")).toBeVisible();
});

test("new guest can RSVP and vote on a poll event", async ({ page }) => {
  const email = `e2e-${Date.now()}-poll@grapple.test`;
  guestEmails.push(email);

  await page.goto(`/event/${pollEventId}`);
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await page.getByPlaceholder("First name").fill("Pat");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/password/i).fill("Test123456!");
  await page.getByRole("button", { name: "Continue to vote" }).click();

  await expect(
    page.getByRole("heading", { name: "Which times work for you?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes", exact: true }).first().click();
  await page.getByRole("button", { name: "Submit votes" }).click();

  await expect(page.getByText("Thanks for voting!")).toBeVisible();
});

test("guest can sync calendar via the TEST_MODE bypass (no Google)", async ({ page }) => {
  const email = `e2e-${Date.now()}-sync@grapple.test`;
  guestEmails.push(email);

  await page.goto(`/event/${smartEventId}?test_calendar=1`);
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await page.getByPlaceholder("First name").fill("Sync");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/password/i).fill("Test123456!");
  // leave the calendar-sync checkbox CHECKED → hits the bypass, not Google
  await page
    .getByRole("button", { name: "Count me in & connect calendar" })
    .click();

  await expect(
    page.getByText(/your google calendar is now synced/i)
  ).toBeVisible();
});

test("mobile visitor sees the Open-in-app banner", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const base = process.env.BASE_URL || "https://grappleapp.co.uk";
  await page.goto(`${base}/event/${smartEventId}`);
  await expect(page.getByText("Open in the Grapple app")).toBeVisible();
  await ctx.close();
});
