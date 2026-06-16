import path from "node:path";
import { z } from "zod";
import { discoverPluginProject } from "./discover.js";
import type { PluginProject, ReadmeMetadata } from "../types.js";
import { ui } from "../ui.js";
import { pathExists } from "../utils/paths.js";

const infoOptionsSchema = z.object({
  json: z.boolean().default(false),
  remote: z.boolean().default(false)
});

export type InfoOptions = z.input<typeof infoOptionsSchema>;

export type LocalPluginInfo = {
  source: "local";
  rootDir: string;
  mainFile: string;
  readmePath?: string;
  name: string;
  slug: string;
  version?: string;
  description?: string;
  author?: string;
  pluginUri?: string;
  authorUri?: string;
  textDomain?: string;
  domainPath?: string;
  requiresAtLeast?: string;
  requiresPhp?: string;
  license?: string;
  licenseUri?: string;
  readme?: ReadmeMetadata;
};

export type HostedPluginInfo = {
  source: "wordpress.org";
  name: string;
  slug: string;
  version?: string;
  author?: string;
  authorProfile?: string;
  homepage?: string;
  pluginUrl: string;
  downloadUrl?: string;
  requires?: string;
  tested?: string;
  requiresPhp?: string;
  activeInstalls?: number;
  lastUpdated?: string;
  added?: string;
  rating?: number;
  ratingPercent?: number;
  ratingCount?: number;
  supportThreads?: number;
  supportThreadsResolved?: number;
  tags: string[];
  description?: string;
  changelog?: string;
};

export type PluginInfo = LocalPluginInfo | HostedPluginInfo;

type PluginInfoApiResponse = {
  error?: string;
  name?: string;
  slug?: string;
  version?: string;
  author?: string;
  author_profile?: string;
  requires?: string | boolean | null;
  tested?: string;
  requires_php?: string | boolean | null;
  rating?: number;
  num_ratings?: number;
  support_threads?: number;
  support_threads_resolved?: number;
  active_installs?: number;
  last_updated?: string;
  added?: string;
  homepage?: string;
  sections?: {
    description?: string;
    changelog?: string;
  };
  download_link?: string;
  tags?: Record<string, string> | string[];
};

export async function info(target: string | undefined, rawOptions: InfoOptions = {}): Promise<void> {
  const options = infoOptionsSchema.parse(rawOptions);
  const result = options.json
    ? await getPluginInfo(target, { remote: options.remote })
    : await ui.task("Reading plugin info", () => getPluginInfo(target, { remote: options.remote }), (value) =>
        `Found ${value.name}`
      );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printPluginInfo(result);
}

export async function getPluginInfo(target: string | undefined, options: Pick<z.infer<typeof infoOptionsSchema>, "remote"> = { remote: false }): Promise<PluginInfo> {
  const resolvedTarget = target ?? process.cwd();

  if (options.remote) {
    return fetchHostedPluginInfo(await resolveHostedInfoSlug(target));
  }

  if (isLocalPluginTarget(resolvedTarget)) {
    return localPluginInfo(await discoverPluginProject(resolvedTarget));
  }

  return fetchHostedPluginInfo(slugFromHostedTarget(resolvedTarget));
}

export async function resolveHostedInfoSlug(target: string | undefined): Promise<string> {
  const resolvedTarget = target ?? process.cwd();

  if (isLocalPluginTarget(resolvedTarget)) {
    const project = await discoverPluginProject(resolvedTarget);
    return project.slug;
  }

  return slugFromHostedTarget(resolvedTarget);
}

export function localPluginInfo(project: PluginProject): LocalPluginInfo {
  return {
    source: "local",
    rootDir: project.rootDir,
    mainFile: project.mainFile,
    readmePath: project.readmePath,
    name: project.headers.pluginName,
    slug: project.slug,
    version: project.version,
    description: project.headers.description,
    author: project.headers.author,
    pluginUri: project.headers.pluginUri,
    authorUri: project.headers.authorUri,
    textDomain: project.headers.textDomain,
    domainPath: project.headers.domainPath,
    requiresAtLeast: project.headers.requiresAtLeast ?? project.readme?.requiresAtLeast,
    requiresPhp: project.headers.requiresPhp ?? project.readme?.requiresPhp,
    license: project.headers.license ?? project.readme?.license,
    licenseUri: project.headers.licenseUri ?? project.readme?.licenseUri,
    readme: project.readme
  };
}

let latestWordPressVersionCache: { value: string | undefined; fetchedAt: number } | undefined;
const LATEST_WP_VERSION_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchLatestWordPressVersion(): Promise<string | undefined> {
  const now = Date.now();
  if (latestWordPressVersionCache && now - latestWordPressVersionCache.fetchedAt < LATEST_WP_VERSION_TTL_MS) {
    return latestWordPressVersionCache.value;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch("https://api.wordpress.org/core/version-check/1.7/", {
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    const body = (await response.json()) as { offers?: Array<{ version?: string; current?: string }> };
    const current = body.offers?.find((offer) => offer.version)?.version ?? body.offers?.[0]?.current;
    latestWordPressVersionCache = { value: current, fetchedAt: now };
    return current;
  } catch {
    latestWordPressVersionCache = { value: latestWordPressVersionCache?.value, fetchedAt: now };
    return latestWordPressVersionCache.value;
  }
}

export async function fetchHostedPluginInfo(slug: string): Promise<HostedPluginInfo> {
  const url = new URL("https://api.wordpress.org/plugins/info/1.2/");
  url.searchParams.set("action", "plugin_information");
  url.searchParams.set("request[slug]", slug);

  const response = await fetch(url);
  const body = (await response.json()) as PluginInfoApiResponse;

  if (!response.ok || body.error) {
    throw new Error(body.error ? `WordPress.org plugin not found: ${slug}` : `Could not fetch plugin info for ${slug}.`);
  }

  return hostedPluginInfoFromApi(body, slug);
}

export function hostedPluginInfoFromApi(body: PluginInfoApiResponse, fallbackSlug: string): HostedPluginInfo {
  const slug = body.slug ?? fallbackSlug;

  return {
    source: "wordpress.org",
    name: body.name ?? slug,
    slug,
    version: body.version,
    author: cleanText(body.author),
    authorProfile: body.author_profile,
    homepage: body.homepage,
    pluginUrl: `https://wordpress.org/plugins/${slug}/`,
    downloadUrl: body.download_link,
    requires: normalizeApiVersion(body.requires),
    tested: body.tested,
    requiresPhp: normalizeApiVersion(body.requires_php),
    activeInstalls: body.active_installs,
    lastUpdated: body.last_updated,
    added: body.added,
    rating: body.rating === undefined ? undefined : body.rating / 20,
    ratingPercent: body.rating,
    ratingCount: body.num_ratings,
    supportThreads: body.support_threads,
    supportThreadsResolved: body.support_threads_resolved,
    tags: normalizeTags(body.tags),
    description: cleanText(body.sections?.description),
    changelog: cleanText(body.sections?.changelog)
  };
}

export function slugFromHostedTarget(target: string): string {
  try {
    const url = new URL(target);
    const parts = url.pathname.split("/").filter(Boolean);
    const pluginIndex = parts.indexOf("plugins");
    const slug = pluginIndex >= 0 ? parts[pluginIndex + 1] : parts.at(-1);
    if (slug) {
      return slug;
    }
  } catch {
    // Not a URL; treat it as a slug below.
  }

  return target.replace(/^\/+|\/+$/g, "");
}

function isLocalPluginTarget(target: string): boolean {
  return target === "." || target.startsWith("..") || target.startsWith(`.${path.sep}`) || path.isAbsolute(target) || pathExists(target);
}

function printPluginInfo(result: PluginInfo): void {
  ui.section(result.name);
  ui.keyValue("Source", result.source);
  ui.keyValue("Slug", result.slug);
  ui.keyValue("Version", result.version ?? "unknown");

  if (result.source === "local") {
    ui.keyValue("Path", ui.path(result.rootDir));
    ui.keyValue("Main file", ui.path(path.relative(result.rootDir, result.mainFile)));
    ui.keyValue("Readme", result.readmePath ? ui.path(path.relative(result.rootDir, result.readmePath)) : "missing");
    ui.keyValue("Author", result.author ?? "unknown");
    ui.keyValue("Text domain", result.textDomain ?? "unknown");
    ui.keyValue("Requires WP", result.requiresAtLeast ?? "unknown");
    ui.keyValue("Requires PHP", result.requiresPhp ?? "unknown");
    ui.keyValue("Stable tag", result.readme?.stableTag ?? "unknown");
    ui.keyValue("Tested up to", result.readme?.testedUpTo ?? "unknown");
    ui.keyValue("License", result.license ?? "unknown");
    printList("Tags", result.readme?.tags);
    printList("Contributors", result.readme?.contributors);
    printLongText("Description", result.description);
    return;
  }

  ui.keyValue("Author", result.author ?? "unknown");
  ui.keyValue("Active", formatActiveInstalls(result.activeInstalls));
  ui.keyValue("Requires WP", result.requires ? `${result.requires}+` : "unknown");
  ui.keyValue("Tested up to", result.tested ?? "unknown");
  ui.keyValue("Requires PHP", result.requiresPhp ? `${result.requiresPhp}+` : "unknown");
  ui.keyValue("Last updated", result.lastUpdated ?? "unknown");
  ui.keyValue("Added", result.added ?? "unknown");
  ui.keyValue("Rating", formatRating(result));
  ui.keyValue("Support", formatSupport(result));
  ui.keyValue("URL", ui.path(result.pluginUrl));
  if (result.downloadUrl) {
    ui.keyValue("Download", ui.path(result.downloadUrl));
  }
  printList("Tags", result.tags);
  printLongText("Description", result.description);
}

function printList(label: string, values: string[] | undefined): void {
  if (!values || values.length === 0) {
    ui.keyValue(label, "none");
    return;
  }

  ui.keyValue(label, values.join(", "));
}

function printLongText(label: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  ui.section(label);
  console.log(value);
}

function normalizeTags(tags: PluginInfoApiResponse["tags"]): string[] {
  if (Array.isArray(tags)) {
    return tags;
  }

  if (!tags) {
    return [];
  }

  return Object.values(tags);
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

function normalizeApiVersion(value: string | boolean | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed && trimmed !== "0" ? trimmed : undefined;
}

function formatActiveInstalls(value: number | undefined): string {
  if (value === undefined) {
    return "unknown";
  }

  return `${new Intl.NumberFormat("en-US").format(value)}+`;
}

function formatRating(result: HostedPluginInfo): string {
  if (result.rating === undefined || result.ratingCount === undefined) {
    return "unknown";
  }

  return `${result.rating.toFixed(1)}/5 (${result.ratingCount})`;
}

function formatSupport(result: HostedPluginInfo): string {
  if (result.supportThreads === undefined || result.supportThreadsResolved === undefined) {
    return "unknown";
  }

  return `${result.supportThreadsResolved}/${result.supportThreads} resolved`;
}
