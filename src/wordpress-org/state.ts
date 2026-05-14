import type { Page } from "playwright";
import { hasSavedSession, isLoggedIn, openBrowserSession } from "../auth/session.js";
import { discoverPluginProject } from "../plugin/discover.js";
import { ui } from "../ui.js";
import { pathExists } from "../utils/paths.js";

export type WordPressOrgPluginState = {
  name: string;
  submittedOn?: string;
  reviewStatus?: string;
  assignedSlug?: string;
  pluginId?: string;
  submittedFile?: {
    uploadDate?: string;
    file?: string;
    version?: string;
  };
  pluginCheckUrl?: string;
  canChangeSlug: boolean;
  canUploadUpdate: boolean;
};

export type StatusOptions = {
  json?: boolean;
};

export async function status(slugNameOrPath: string | undefined, options: StatusOptions = {}): Promise<void> {
  if (!options.json) {
    ui.intro("WordPress.org plugin status");
  }

  if (!(await hasSavedSession())) {
    throw new Error("No WordPress.org browser session found. Run `pressship login` first.");
  }

  const filter = slugNameOrPath ? await resolveStatusFilter(slugNameOrPath) : undefined;
  const states = options.json
    ? await fetchPluginStates()
    : await ui.task("Fetching WordPress.org developer page", fetchPluginStates);
  const filtered = filter ? states.filter((state) => matchesPluginState(state, filter.slug) || matchesPluginState(state, filter.name)) : states;

  if (options.json) {
    console.log(JSON.stringify(filter ? filtered[0] ?? null : filtered, null, 2));
    return;
  }

  if (filtered.length === 0) {
    ui.warn(filter ? `No submitted plugin found matching ${filter.label}.` : "No submitted plugins found.");
    return;
  }

  for (const state of filtered) {
    printPluginState(state);
  }
}

export async function fetchPluginStates(): Promise<WordPressOrgPluginState[]> {
  const { context, page } = await openBrowserSession({ headless: true });

  try {
    if (!(await isLoggedIn(page))) {
      throw new Error("Saved WordPress.org session is not logged in. Run `pressship login` first.");
    }

    return await readPluginStatesFromPage(page);
  } finally {
    await context.browser()?.close();
  }
}

export async function readPluginStatesFromPage(page: Page): Promise<WordPressOrgPluginState[]> {
  return page.locator(".plugin-submission-item").evaluateAll((items) =>
    items.map((item) => {
      const text = item.textContent ?? "";
      const queryText = (selector: string) =>
        item.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || undefined;
      const parseValue = (value: string | undefined, label: string) =>
        value?.replace(new RegExp(`^${label}:\\s*`, "i"), "").trim() || undefined;
      const parseSubmittedFile = () => {
        const rows = Array.from(item.querySelectorAll(".plugin-submission-file__meta tr")) as Array<{
          querySelector(selector: string): { textContent: string | null } | null;
        }>;
        const values = Object.fromEntries(
          rows.map((row) => {
            const label = row.querySelector("th")?.textContent?.replace(":", "").trim().toLowerCase() ?? "";
            const value = row.querySelector("td")?.textContent?.trim() ?? "";
            return [label, value];
          })
        );
        const uploadDate = values["upload date"] || text.match(/Upload Date:\s*([^\n\r]+)/i)?.[1]?.trim();
        const file = values.file || text.match(/File:\s*([^\n\r]+)/i)?.[1]?.trim();
        const version = values.version || text.match(/Version:\s*([^\n\r]+)/i)?.[1]?.trim();

        return uploadDate || file || version ? { uploadDate, file, version } : undefined;
      };
      const form = item.querySelector('form input[name="action"][value="upload-additional"]')?.closest("form");
      const links = Array.from(item.querySelectorAll("a")) as Array<{
        textContent: string | null;
        getAttribute(name: string): string | null;
      }>;
      const pluginCheckLink = links.find((link) =>
        /Plugin Check/i.test(link.textContent ?? "")
      );

      return {
        name: queryText(".plugin-submission-name") ?? "Unknown plugin",
        submittedOn: parseValue(queryText(".plugin-submission-submited-date"), "Submitted on"),
        reviewStatus: parseValue(queryText(".plugin-submission-status"), "Review status"),
        assignedSlug:
          item.querySelector(".plugin-submission-assigned-slug code")?.textContent?.trim() ||
          parseValue(queryText(".plugin-submission-assigned-slug"), "Current assigned slug"),
        pluginId:
          (form?.querySelector('input[name="plugin_id"]') as { value?: string } | null)?.value ||
          (item.querySelector('form input[name="id"]') as { value?: string } | null)?.value ||
          undefined,
        submittedFile: parseSubmittedFile(),
        pluginCheckUrl: pluginCheckLink?.getAttribute("href") ?? undefined,
        canChangeSlug: Boolean(item.querySelector('form input[name="action"][value="request-slug-change"]')),
        canUploadUpdate: Boolean(form)
      };
    })
  );
}

export function matchesPluginState(state: WordPressOrgPluginState, slugOrName: string): boolean {
  const needle = slugOrName.toLowerCase();
  return state.name.toLowerCase() === needle || state.assignedSlug?.toLowerCase() === needle;
}

export async function resolveStatusFilter(value: string): Promise<{ slug: string; name: string; label: string }> {
  if (pathExists(value)) {
    const project = await discoverPluginProject(value);
    return {
      slug: project.slug,
      name: project.headers.pluginName,
      label: `${project.headers.pluginName} (${project.slug})`
    };
  }

  return {
    slug: value,
    name: value,
    label: value
  };
}

export function printPluginState(state: WordPressOrgPluginState): void {
  ui.section(state.name);
  ui.keyValue("Status", state.reviewStatus ?? "unknown");
  ui.keyValue("Slug", state.assignedSlug ?? "unknown");
  ui.keyValue("Submitted", state.submittedOn ?? "unknown");
  ui.keyValue("Plugin ID", state.pluginId ?? "unknown");
  ui.keyValue("Reupload", state.canUploadUpdate ? ui.value("available") : "not available");
  ui.keyValue("Slug change", state.canChangeSlug ? ui.value("available") : "not available");

  if (state.submittedFile) {
    ui.keyValue("File", state.submittedFile.file ?? "unknown");
    ui.keyValue("Version", state.submittedFile.version ?? "unknown");
    ui.keyValue("Uploaded", state.submittedFile.uploadDate ?? "unknown");
  }

  if (state.pluginCheckUrl) {
    ui.keyValue("Plugin Check", ui.path(state.pluginCheckUrl));
  }
}

