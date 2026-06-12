import { spawn } from "node:child_process";
import {
  createHarnessClient,
  type CommandResult,
  type CommandRunner,
  type CommandRunnerOptions,
  type HarnessEvent,
  type HarnessRunResult,
  type ProviderAdapter,
  type ProviderId,
  type ProviderStatus
} from "harness-app-sdk";

export type InstalledAiAssistantId = ProviderId;
export type AiAssistantId = "none" | InstalledAiAssistantId;
export type AiAssistantStatus = "ready" | "installed" | "not_authenticated" | "not_installed" | "error";

export type AiAssistantHarness = {
  id: InstalledAiAssistantId;
  label: string;
  command: string;
  checkedCommand: string;
};

let cachedAiAssistantHarnesses: AiAssistantHarness[] | undefined;

export const installedAiAssistantIds = getAiAssistantHarnesses().map((provider) => provider.id);
export const aiAssistantIds: readonly AiAssistantId[] = ["none", ...installedAiAssistantIds];

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
  harnesses: AiAssistantHarness[];
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

const SECRET_PATTERNS = [
  /\b(sk-[A-Za-z0-9_-]{16,})\b/g,
  /\b([A-Za-z0-9_]*API_KEY[A-Za-z0-9_]*=)[^\s]+/gi,
  /\b([A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=)[^\s]+/gi
];

export function getAiAssistantHarnesses(): AiAssistantHarness[] {
  cachedAiAssistantHarnesses ??= harnessesFromProviders(
    createHarnessClient({
      runner: defaultAiCommandRunner,
      env: createHarnessAiEnvironment(),
      timeoutMs: 5_000
    }).providers()
  );

  return cachedAiAssistantHarnesses.map((provider) => ({ ...provider }));
}

export async function detectAiAssistance(runner?: AiCommandRunner): Promise<AiAssistanceDetection> {
  const client = createHarnessClient({
    runner: runner ?? defaultAiCommandRunner,
    env: createHarnessAiEnvironment(),
    timeoutMs: 5_000
  });
  const harnesses = harnessesFromProviders(client.providers());
  const harnessById = new Map(harnesses.map((provider) => [provider.id, provider]));
  const harnessOrder = new Map(harnesses.map((provider, index) => [provider.id, index]));
  const statuses = await client.detect();
  const providers = statuses
    .filter((status): status is ProviderStatus & { id: InstalledAiAssistantId } =>
      isInstalledAiAssistantId(status.id)
    )
    .map((status) => providerStatusToAiProvider(status, harnessById.get(status.id)))
    .sort((a, b) => (harnessOrder.get(a.id) ?? 0) - (harnessOrder.get(b.id) ?? 0));

  return {
    detectedAt: new Date().toISOString(),
    harnesses,
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
    runner: options.runner ?? defaultAiCommandRunner,
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
  return getAiAssistantHarnesses().some((provider) => provider.id === value);
}

export function isAiAssistantId(value: string): value is AiAssistantId {
  return value === "none" || isInstalledAiAssistantId(value);
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

async function defaultAiCommandRunner(
  command: string,
  args: string[],
  options: CommandRunnerOptions
): Promise<CommandResult> {
  const startedAt = Date.now();

  return await new Promise<CommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const finish = (result: Partial<CommandResult>) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      if (onAbort) {
        options.signal?.removeEventListener("abort", onAbort);
      }

      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode: result.exitCode ?? null,
        stdout: redactAiCommandOutput(stdout),
        stderr: redactAiCommandOutput(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
        aborted,
        error: result.error
      });
    };

    onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
    };

    if (options.signal?.aborted) {
      onAbort();
    } else {
      options.signal?.addEventListener("abort", onAbort, { once: true });
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = redactAiCommandOutput(chunk.toString());
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = redactAiCommandOutput(chunk.toString());
      stderr += text;
      options.onStderr?.(text);
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ exitCode: null, error });
    });

    child.once("close", (exitCode) => {
      finish({ exitCode });
    });
  });
}

function redactAiCommandOutput(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) =>
      current.replace(pattern, (_match, prefix) =>
        typeof prefix === "string" && prefix.endsWith("=") ? `${prefix}[redacted]` : "[redacted]"
      ),
    value
  );
}

function harnessesFromProviders(providers: ProviderAdapter[]): AiAssistantHarness[] {
  return providers.map(providerToAiAssistantHarness);
}

function providerToAiAssistantHarness(provider: ProviderAdapter): AiAssistantHarness {
  return {
    id: provider.id,
    label: provider.name,
    command: provider.command,
    checkedCommand: checkedCommandForProvider(provider.command)
  };
}

function providerStatusToAiProvider(
  status: ProviderStatus & { id: InstalledAiAssistantId },
  harness?: AiAssistantHarness
): AiAssistantProvider {
  return {
    id: status.id,
    label: harness?.label ?? status.name,
    command: status.command,
    installed: status.available,
    authenticated: status.authenticated === null ? undefined : status.authenticated,
    status: providerStatus(status),
    detail: providerDetail(status),
    checkedCommand: checkedCommandForProvider(status.command)
  };
}

function checkedCommandForProvider(command: string): string {
  if (command.startsWith("@")) {
    return command;
  }

  return command === "npx" ? "npx --version" : `${command} --version`;
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
