import {
  createHarnessClient,
  type CommandRunner,
  type HarnessEvent,
  type HarnessRunResult,
  type ProviderId,
  type ProviderStatus
} from "harness-app-sdk";

export const installedAiAssistantIds = ["codex", "claude", "copilot", "gemini", "wp-studio"] as const satisfies readonly ProviderId[];
export const aiAssistantIds = ["none", ...installedAiAssistantIds] as const;
export type AiAssistantId = (typeof aiAssistantIds)[number];
export type InstalledAiAssistantId = (typeof installedAiAssistantIds)[number];
export type AiAssistantStatus = "ready" | "installed" | "not_authenticated" | "not_installed" | "error";

export type AiAssistantProvider = {
  id: InstalledAiAssistantId;
  label: string;
  command: string;
  installed: boolean;
  authenticated?: boolean;
  status: AiAssistantStatus;
  detail: string;
  checkedCommand?: string;
};

export type AiAssistanceDetection = {
  detectedAt: string;
  providers: AiAssistantProvider[];
};

export type AiCommandRunner = CommandRunner;

export type AiAssistantPromptInput = {
  pluginPath: string;
  userPrompt: string;
  selectedFile?: string;
  pluginCheck?: AiAssistantPluginCheckContext;
};

export type AiAssistantPluginCheckContext = {
  checkedAt?: string;
  skipped?: boolean;
  available?: boolean;
  summary?: {
    error: number;
    warning: number;
    info: number;
    total: number;
    blocking: boolean;
  };
  findings?: AiAssistantPluginCheckFinding[];
};

export type AiAssistantPluginCheckFinding = {
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
  file?: string;
  line?: number;
  column?: number;
};

export type RunAiAssistantOptions = {
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  runner?: AiCommandRunner;
  onEvent?: (event: HarnessEvent) => void;
};

const providerLabels: Record<InstalledAiAssistantId, string> = {
  codex: "Codex",
  claude: "Claude",
  copilot: "Copilot",
  gemini: "Gemini",
  "wp-studio": "WP Studio"
};

export async function detectAiAssistance(runner?: AiCommandRunner): Promise<AiAssistanceDetection> {
  const client = createHarnessClient({
    runner,
    env: createHarnessAiEnvironment(),
    timeoutMs: 5_000
  });
  const statuses = await client.detect();
  const providers = statuses
    .filter((status): status is ProviderStatus & { id: InstalledAiAssistantId } =>
      isInstalledAiAssistantId(status.id)
    )
    .map(providerStatusToAiProvider)
    .sort((a, b) => installedAiAssistantIds.indexOf(a.id) - installedAiAssistantIds.indexOf(b.id));

  return {
    detectedAt: new Date().toISOString(),
    providers
  };
}

export async function runAiAssistant(
  assistant: InstalledAiAssistantId,
  prompt: string,
  options: RunAiAssistantOptions
): Promise<HarnessRunResult> {
  const client = createHarnessClient({
    cwd: options.cwd,
    runner: options.runner,
    env: createHarnessAiEnvironment(),
    timeoutMs: options.timeoutMs ?? 0
  });

  return await client.run({
    prompt,
    provider: assistant,
    cwd: options.cwd,
    stream: true,
    allowEdits: true,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 0,
    onEvent: options.onEvent
  });
}

export function createAiAssistantEnvironment(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    NO_COLOR: "1",
    FORCE_COLOR: "0"
  };

  delete env.TERM;
  return env;
}

export function describeAiAssistantRun(run: Pick<HarnessRunResult, "command" | "args">): string {
  return [run.command, ...run.args.map((arg, index) => (shouldRedactRunArg(run, index) ? "<prompt>" : arg))].join(" ");
}

export function isInstalledAiAssistantId(value: string): value is InstalledAiAssistantId {
  return installedAiAssistantIds.includes(value as InstalledAiAssistantId);
}

export function createAiAssistantPrompt(input: AiAssistantPromptInput): string {
  const selectedFile = input.selectedFile ? `\nCurrent editor file: ${input.selectedFile}` : "";
  const pluginCheck = formatAiAssistantPluginCheckContext(input.pluginCheck);

  return `You are running from Pressship Studio inside a local WordPress plugin project.
Plugin path: ${input.pluginPath}${selectedFile}

Work in this plugin folder. Keep changes focused on the user's request. If you edit files, preserve the existing project style and avoid unrelated refactors.
Pressship Studio will show your file edits as reviewable patches for the user to accept or reject.

Current Plugin Check context:
${pluginCheck}

User request:
${input.userPrompt}`;
}

function createHarnessAiEnvironment(): NodeJS.ProcessEnv {
  return {
    ...createAiAssistantEnvironment(),
    TERM: undefined
  };
}

function providerStatusToAiProvider(status: ProviderStatus & { id: InstalledAiAssistantId }): AiAssistantProvider {
  return {
    id: status.id,
    label: providerLabels[status.id],
    command: status.command,
    installed: status.available,
    authenticated: status.authenticated === null ? undefined : status.authenticated,
    status: providerStatus(status),
    detail: providerDetail(status),
    checkedCommand: `${status.command} --version`
  };
}

function providerStatus(status: ProviderStatus): AiAssistantStatus {
  if (!status.available) {
    return "not_installed";
  }

  if (status.authenticated === false) {
    return "not_authenticated";
  }

  return status.authenticated === true ? "ready" : "installed";
}

function providerDetail(status: ProviderStatus): string {
  if (status.message) {
    return status.message;
  }

  if (!status.available) {
    return `${status.name} was not found in PATH.`;
  }

  if (status.version) {
    return status.authenticated === true ? `${status.version}. Signed in.` : status.version;
  }

  return status.authenticated === true ? "Ready." : "Installed.";
}

function shouldRedactRunArg(run: Pick<HarnessRunResult, "command" | "args">, index: number): boolean {
  const previous = run.args[index - 1];

  if (previous === "-p" || previous === "--prompt") {
    return true;
  }

  if (run.command === "codex" && index === run.args.length - 1) {
    return true;
  }

  return run.command === "npx" && run.args[0]?.startsWith("wp-studio") && run.args[1] === "code" && index === 2;
}

function formatAiAssistantPluginCheckContext(checkState: AiAssistantPluginCheckContext | undefined): string {
  if (!checkState) {
    return "No saved Plugin Check result is available for this plugin yet.";
  }

  const summary = checkState.summary;
  const errorFindings = (checkState.findings ?? []).filter((finding) => finding.severity === "error");
  const lines = [
    `Checked at: ${checkState.checkedAt ?? "unknown"}.`,
    summary
      ? `Summary: ${summary.error} errors, ${summary.warning} warnings, ${summary.info} info; blocking=${summary.blocking ? "yes" : "no"}.`
      : "Summary: unavailable.",
    checkState.skipped ? "Plugin Check was skipped." : "",
    checkState.available === false ? "Plugin Check was unavailable." : "",
    errorFindings.length ? "Current errors:" : "Current errors: none recorded."
  ].filter(Boolean);

  lines.push(...errorFindings.map(formatAiAssistantPluginCheckFinding));
  return lines.join("\n");
}

function formatAiAssistantPluginCheckFinding(finding: AiAssistantPluginCheckFinding): string {
  const location = finding.file
    ? `${finding.file}${finding.line ? `:${finding.line}${finding.column ? `:${finding.column}` : ""}` : ""}`
    : "plugin";
  const code = finding.code ? ` [${finding.code}]` : "";
  return `- ${location}${code}: ${compactPromptLine(finding.message, 500)}`;
}

function compactPromptLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 3)}...` : compacted;
}
