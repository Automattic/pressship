import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { discoverPluginProject } from "./discover.js";
import { fetchHostedPluginInfo, slugFromHostedTarget } from "./info.js";
import type { PluginProject } from "../types.js";
import { ui } from "../ui.js";
import { ensureCacheDir, pathExists } from "../utils/paths.js";

const playgroundCliPackage = "@wp-playground/cli@latest";
const compatibilityMuPluginPath = "/wordpress/wp-content/mu-plugins/pressship-playground-compat.php";
const compatibilityMuPlugin = `<?php
error_reporting(error_reporting() & ~E_DEPRECATED & ~E_USER_DEPRECATED);
set_error_handler(static function (int $severity): bool {
    return $severity === E_DEPRECATED || $severity === E_USER_DEPRECATED;
});

if (! function_exists('is_plugin_active')) {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
}

function pressship_remove_frame_options_header(): void {
    remove_action('admin_init', 'send_frame_options_header');
    remove_action('login_init', 'send_frame_options_header');
    header_remove('X-Frame-Options');
}

pressship_remove_frame_options_header();

add_filter('wp_headers', static function (array $headers): array {
    unset($headers['X-Frame-Options']);
    unset($headers['x-frame-options']);
    return $headers;
});

add_action('init', 'pressship_remove_frame_options_header', 0);
add_action('admin_init', 'pressship_remove_frame_options_header', 0);
add_action('admin_init', 'pressship_remove_frame_options_header', PHP_INT_MAX);
add_action('login_init', 'pressship_remove_frame_options_header', 0);
add_action('login_init', 'pressship_remove_frame_options_header', PHP_INT_MAX);
add_action('send_headers', 'pressship_remove_frame_options_header', PHP_INT_MAX);

add_action('init', static function (): void {
    if (! username_exists('admin')) {
        $user_id = wp_create_user('admin', 'password', 'admin@example.test');
        if (! is_wp_error($user_id)) {
            $user = new WP_User($user_id);
            $user->set_role('administrator');
        }
    }

    if (! is_admin() || is_user_logged_in() || ! isset($_GET['pressship_auto_login'])) {
        return;
    }

    $user = get_user_by('login', 'admin');
    if (! $user) {
        return;
    }

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID);
    wp_safe_redirect(remove_query_arg('pressship_auto_login'));
    exit;
});
`;

const demoOptionsSchema = z.object({
  port: z.string().optional(),
  wp: z.string().optional(),
  php: z.string().optional(),
  reset: z.boolean().default(false),
  skipBrowser: z.boolean().default(false)
});

export type DemoOptions = z.input<typeof demoOptionsSchema>;

export type PlaygroundBlueprint = {
  landingPage: string;
  steps: Array<Record<string, unknown>>;
};

export type DemoLaunchPlan = {
  source: "local" | "wordpress.org";
  name: string;
  slug: string;
  command: string;
  args: string[];
  cwd: string;
  blueprintPath: string;
  siteDir: string;
  wpVersion?: string;
  phpVersion?: string;
  url?: string;
};

export async function demo(target: string | undefined, rawOptions: DemoOptions = {}): Promise<void> {
  const options = demoOptionsSchema.parse(rawOptions);
  ui.intro("Start plugin demo");

  const plan = await ui.task("Preparing Playground demo", () => createDemoLaunchPlan(target, options), (value) =>
    `Prepared ${value.name}`
  );

  ui.section("Playground");
  ui.keyValue("Plugin", plan.name);
  ui.keyValue("Source", plan.source);
  ui.keyValue("Slug", plan.slug);
  ui.keyValue("WordPress", plan.wpVersion ?? "default");
  ui.keyValue("PHP", plan.phpVersion ?? "default");
  ui.keyValue("Site", ui.path(plan.siteDir));
  if (plan.url) {
    ui.keyValue("URL", ui.path(plan.url));
  }
  ui.keyValue("Blueprint", ui.path(plan.blueprintPath));

  if (options.reset) {
    await ui.task("Resetting persisted Playground site", () => resetPlaygroundSite(plan.siteDir), () => "Reset complete");
  }

  ui.info("Starting WordPress Playground. Press Ctrl+C to stop the local server.");

  await execa(plan.command, plan.args, {
    cwd: plan.cwd,
    stdio: "inherit"
  });
}

export async function createDemoLaunchPlan(
  target: string | undefined,
  options: z.infer<typeof demoOptionsSchema>
): Promise<DemoLaunchPlan> {
  const resolvedTarget = target ?? process.cwd();

  if (isLocalPluginTarget(resolvedTarget)) {
    const project = await discoverPluginProject(resolvedTarget);
    const blueprintPath = await writeDemoBlueprint(project.slug, createLocalDemoBlueprint(project));
    const playgroundOptions = resolveDemoPlaygroundOptions(options, {
      wp: project.headers.requiresAtLeast ?? project.readme?.requiresAtLeast,
      php: project.headers.requiresPhp ?? project.readme?.requiresPhp
    });
    const url = options.port ? `http://127.0.0.1:${options.port}` : undefined;

    return {
      source: "local",
      name: project.headers.pluginName,
      slug: project.slug,
      command: "npx",
      args: createPlaygroundStartArgs({
        path: project.rootDir,
        blueprintPath,
        mount: `${project.rootDir}:/wordpress/wp-content/plugins/${project.slug}`,
        options: playgroundOptions
      }),
      cwd: project.rootDir,
      blueprintPath,
      siteDir: getPlaygroundSiteDir(project.rootDir),
      wpVersion: playgroundOptions.wp,
      phpVersion: playgroundOptions.php,
      url
    };
  }

  const slug = slugFromHostedTarget(resolvedTarget);
  const plugin = await fetchHostedPluginInfo(slug);
  const blueprintPath = await writeDemoBlueprint(slug, createHostedDemoBlueprint(slug));
  const demoDir = path.dirname(blueprintPath);
  const playgroundOptions = resolveDemoPlaygroundOptions(options, {
    wp: plugin.requires,
    php: plugin.requiresPhp
  });
  const url = options.port ? `http://127.0.0.1:${options.port}` : undefined;

  return {
    source: "wordpress.org",
    name: plugin.name,
    slug,
    command: "npx",
    args: createPlaygroundStartArgs({
      path: demoDir,
      blueprintPath,
      options: playgroundOptions
    }),
    cwd: demoDir,
    blueprintPath,
    siteDir: getPlaygroundSiteDir(demoDir),
    wpVersion: playgroundOptions.wp,
    phpVersion: playgroundOptions.php,
    url
  };
}

export function createLocalDemoBlueprint(project: PluginProject): PlaygroundBlueprint {
  const relativeMainFile = path.relative(project.rootDir, project.mainFile).split(path.sep).join("/");

  return {
    landingPage: "/wp-admin/plugins.php",
    steps: [
      ...createPlaygroundCompatibilitySteps(),
      {
        step: "activatePlugin",
        pluginName: project.headers.pluginName,
        pluginPath: `/wordpress/wp-content/plugins/${project.slug}/${relativeMainFile}`
      }
    ]
  };
}

export function createHostedDemoBlueprint(slug: string): PlaygroundBlueprint {
  return {
    landingPage: "/wp-admin/plugins.php",
    steps: [
      ...createPlaygroundCompatibilitySteps(),
      {
        step: "installPlugin",
        pluginData: {
          resource: "wordpress.org/plugins",
          slug
        },
        options: {
          activate: true
        }
      }
    ]
  };
}

export function createPlaygroundCompatibilitySteps(): Array<Record<string, unknown>> {
  return [
    {
      step: "mkdir",
      path: "/wordpress/wp-content/mu-plugins"
    },
    {
      step: "writeFile",
      path: compatibilityMuPluginPath,
      data: compatibilityMuPlugin
    }
  ];
}

export function createPlaygroundStartArgs(input: {
  path: string;
  blueprintPath: string;
  mount?: string;
  options: z.infer<typeof demoOptionsSchema>;
}): string[] {
  return [
    "--yes",
    playgroundCliPackage,
    "start",
    `--path=${input.path}`,
    `--blueprint=${input.blueprintPath}`,
    "--define-bool",
    "WP_DEBUG",
    "false",
    "--define-bool",
    "WP_DEBUG_DISPLAY",
    "false",
    ...(input.mount ? ["--no-auto-mount", `--mount=${input.mount}`] : []),
    ...(input.options.port ? [`--port=${input.options.port}`] : []),
    ...(input.options.wp ? [`--wp=${input.options.wp}`] : []),
    ...(input.options.php ? [`--php=${input.options.php}`] : []),
    ...(input.options.skipBrowser ? ["--skip-browser"] : [])
  ];
}

export function resolveDemoPlaygroundOptions(
  options: z.infer<typeof demoOptionsSchema>,
  _requiredVersions: { wp?: unknown; php?: unknown }
): z.infer<typeof demoOptionsSchema> {
  return {
    ...options,
    wp: normalizePlaygroundVersion(options.wp),
    php: normalizePlaygroundVersion(options.php)
  };
}

export function getPlaygroundSiteDir(projectPath: string): string {
  const siteId = createHash("sha256").update(projectPath).digest("hex");
  return path.join(homedir(), ".wordpress-playground", "sites", siteId);
}

export async function resetPlaygroundSite(siteDir: string): Promise<void> {
  await rm(siteDir, { recursive: true, force: true });
}

async function writeDemoBlueprint(slug: string, blueprint: PlaygroundBlueprint): Promise<string> {
  const cacheDir = await ensureCacheDir();
  const demoDir = path.join(cacheDir, "demo", slug);
  const blueprintPath = path.join(demoDir, "blueprint.json");

  await mkdir(demoDir, { recursive: true, mode: 0o700 });
  await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);

  return blueprintPath;
}

function isLocalPluginTarget(target: string): boolean {
  return target === "." || target.startsWith("..") || target.startsWith(`.${path.sep}`) || path.isAbsolute(target) || pathExists(target);
}

function normalizePlaygroundVersion(version: unknown): string | undefined {
  if (typeof version !== "string") {
    return undefined;
  }

  const trimmed = version.trim();
  return trimmed && trimmed !== "0" ? trimmed : undefined;
}
