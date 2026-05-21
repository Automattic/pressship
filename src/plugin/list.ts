import { z } from "zod";
import { hasSavedSession, openBrowserSession } from "../auth/session.js";
import { getWordPressOrgAccount } from "../auth/whoami.js";
import { ui } from "../ui.js";

const listOptionsSchema = z.object({
  json: z.boolean().default(false),
  public: z.boolean().default(false)
});

export type ListOptions = z.input<typeof listOptionsSchema>;

export type ListedPlugin = {
  name: string;
  slug: string;
  url: string;
  author?: string;
  activeInstalls?: string;
  testedWith?: string;
  roles: Array<"contributor" | "committer">;
};

export type PluginListResult = {
  username: string;
  source: "public" | "logged-in";
  plugins: ListedPlugin[];
};

export async function listPlugins(username: string | undefined, rawOptions: ListOptions = {}): Promise<void> {
  const options = listOptionsSchema.parse(rawOptions);
  const result = options.json
    ? await getPluginList(username, options)
    : await ui.task("Listing WordPress.org plugins", () => getPluginList(username, options), (value) =>
        `Found ${value.plugins.length} plugin${value.plugins.length === 1 ? "" : "s"} for ${value.username}`
      );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printPluginList(result);
}

export async function getPluginList(username: string | undefined, options: ListOptions = {}): Promise<PluginListResult> {
  const resolvedUsername = username ?? (await inferCurrentUsername());
  const canUseLoggedInArchive = !options.public && (await shouldUseLoggedInArchive(resolvedUsername, username));
  const plugins = canUseLoggedInArchive
    ? await fetchLoggedInAuthorArchive(resolvedUsername)
    : await fetchPublicAuthorArchive(resolvedUsername);

  return {
    username: resolvedUsername,
    source: canUseLoggedInArchive ? "logged-in" : "public",
    plugins: dedupeListedPlugins(plugins)
  };
}

export function parsePluginArchiveHtml(html: string, username: string): ListedPlugin[] {
  const cards = html.match(/<li\b[^>]*\btype-plugin\b[\s\S]*?<\/li>/g) ?? [];
  return cards.map((card) => parsePluginCard(card, username)).filter((plugin): plugin is ListedPlugin => Boolean(plugin));
}

async function inferCurrentUsername(): Promise<string> {
  if (!(await hasSavedSession())) {
    throw new Error("No username passed and no WordPress.org browser session found. Run `pressship login` or pass a username.");
  }

  return (await getWordPressOrgAccount()).username;
}

async function shouldUseLoggedInArchive(resolvedUsername: string, originalUsername: string | undefined): Promise<boolean> {
  if (!(await hasSavedSession())) {
    return false;
  }

  if (!originalUsername) {
    return true;
  }

  try {
    const account = await getWordPressOrgAccount();
    return account.username.toLowerCase() === resolvedUsername.toLowerCase();
  } catch {
    return false;
  }
}

async function fetchPublicAuthorArchive(username: string): Promise<ListedPlugin[]> {
  const plugins: ListedPlugin[] = [];
  let nextUrl: string | undefined = getAuthorArchiveUrl(username);

  for (let page = 0; nextUrl && page < 20; page += 1) {
    const response = await fetch(nextUrl);
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`Could not fetch WordPress.org plugin list for ${username}.`);
    }

    plugins.push(...parsePluginArchiveHtml(html, username));
    nextUrl = getNextArchivePageUrl(html);
  }

  return plugins;
}

async function fetchLoggedInAuthorArchive(username: string): Promise<ListedPlugin[]> {
  const { context, page } = await openBrowserSession({ headless: true });
  const plugins: ListedPlugin[] = [];
  let nextUrl: string | undefined = getAuthorArchiveUrl(username);

  try {
    for (let pageCount = 0; nextUrl && pageCount < 20; pageCount += 1) {
      await page.goto(nextUrl, { waitUntil: "domcontentloaded" });
      const html = await page.content();
      plugins.push(...parsePluginArchiveHtml(html, username));
      nextUrl = getNextArchivePageUrl(html);
    }
  } finally {
    await context.browser()?.close();
  }

  return plugins;
}

function parsePluginCard(card: string, username: string): ListedPlugin | undefined {
  const linkMatch = card.match(/<h3[^>]*class=["'][^"']*entry-title[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']*\/plugins\/([^/"']+)\/)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!linkMatch) {
    return undefined;
  }

  const classValue = card.match(/<li\b[^>]*class=["']([^"']+)["']/i)?.[1] ?? "";
  const normalizedUsername = username.toLowerCase();
  const roles: ListedPlugin["roles"] = [];
  if (classValue.toLowerCase().split(/\s+/).includes(`plugin_contributors-${normalizedUsername}`)) {
    roles.push("contributor");
  }
  if (classValue.toLowerCase().split(/\s+/).includes(`plugin_committers-${normalizedUsername}`)) {
    roles.push("committer");
  }

  return {
    name: cleanText(linkMatch[3]) ?? linkMatch[2],
    slug: linkMatch[2],
    url: normalizePluginUrl(linkMatch[1]),
    author: cleanText(card.match(/<span class=["']plugin-author["'][\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]),
    activeInstalls: cleanText(card.match(/<span class=["']active-installs["'][\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]),
    testedWith: cleanText(card.match(/<span class=["']tested-with["'][\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]),
    roles: roles.length > 0 ? roles : ["contributor"]
  };
}

function getAuthorArchiveUrl(username: string): string {
  return `https://wordpress.org/plugins/author/${encodeURIComponent(username)}/`;
}

function getNextArchivePageUrl(html: string): string | undefined {
  const nextHref =
    html.match(/<a[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<a[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i)?.[1];
  return nextHref ? normalizePluginUrl(nextHref) : undefined;
}

function dedupeListedPlugins(plugins: ListedPlugin[]): ListedPlugin[] {
  const bySlug = new Map<string, ListedPlugin>();
  for (const plugin of plugins) {
    const existing = bySlug.get(plugin.slug);
    if (!existing) {
      bySlug.set(plugin.slug, plugin);
      continue;
    }

    bySlug.set(plugin.slug, {
      ...existing,
      ...plugin,
      roles: Array.from(new Set([...existing.roles, ...plugin.roles]))
    });
  }

  return Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function printPluginList(result: PluginListResult): void {
  ui.section(`${result.username} (${result.source})`);
  if (result.plugins.length === 0) {
    ui.warn(
      result.source === "public"
        ? "No public contributor plugins found. Log in and run `pressship ls` to include plugins where you only have SVN commit access."
        : "No plugins found."
    );
    return;
  }

  for (const plugin of result.plugins) {
    ui.section(plugin.name);
    ui.keyValue("Slug", plugin.slug);
    ui.keyValue("Role", plugin.roles.join(", "));
    ui.keyValue("Active", plugin.activeInstalls ?? "unknown");
    ui.keyValue("Tested", plugin.testedWith ?? "unknown");
    ui.keyValue("URL", ui.path(plugin.url));
  }
}

function normalizePluginUrl(value: string): string {
  return value.startsWith("//") ? `https:${value}` : new URL(value, "https://wordpress.org").toString();
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();

  return text || undefined;
}
