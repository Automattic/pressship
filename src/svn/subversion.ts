import { confirm } from "@inquirer/prompts";
import { execa } from "execa";
import { ui } from "../ui.js";

export type SubversionInstallCommand = {
  command: string;
  args: string[];
};

export type SubversionInstallPlan = {
  platform: NodeJS.Platform;
  manager?: string;
  commands: SubversionInstallCommand[];
  instructions: string[];
};

export type EnsureSvnOptions = {
  autoInstall?: boolean;
  interactive?: boolean;
};

const INSTALL_COMMANDS = ["brew", "apt-get", "dnf", "yum", "pacman", "zypper", "apk", "sudo", "winget", "choco"];

export async function ensureSvnAvailable(options: EnsureSvnOptions = {}): Promise<void> {
  if (await isSvnAvailable()) {
    return;
  }

  const plan = getSubversionInstallPlan(process.platform, await findAvailableInstallCommands());
  const autoInstall = options.autoInstall ?? true;
  const interactive = options.interactive ?? process.stdin.isTTY;

  if (!autoInstall || plan.commands.length === 0) {
    throw new Error(formatSubversionInstallInstructions(plan));
  }

  if (!interactive) {
    throw new Error(
      [
        "Subversion (`svn`) is required, but it is not installed.",
        "Automatic installation needs an interactive terminal.",
        ...plan.instructions.map((instruction) => `- ${instruction}`)
      ].join("\n")
    );
  }

  ui.warn("Subversion (`svn`) is required, but it is not installed.");
  ui.info(`Detected ${plan.manager}. Pressship can run: ${formatInstallCommands(plan.commands)}`);
  const shouldInstall = await confirm({ message: "Install Subversion now?", default: true });

  if (!shouldInstall) {
    throw new Error(formatSubversionInstallInstructions(plan));
  }

  for (const command of plan.commands) {
    await execa(command.command, command.args, { stdio: "inherit" });
  }

  if (!(await isSvnAvailable())) {
    throw new Error(
      "Subversion install command finished, but `svn` is still not available on PATH. Open a new terminal or install it manually."
    );
  }
}

export async function isSvnAvailable(): Promise<boolean> {
  return commandExists("svn");
}

export function getSubversionInstallPlan(
  platform: NodeJS.Platform,
  availableCommands: Iterable<string>
): SubversionInstallPlan {
  const available = new Set(availableCommands);

  if (platform === "darwin") {
    if (available.has("brew")) {
      return {
        platform,
        manager: "Homebrew",
        commands: [{ command: "brew", args: ["install", "subversion"] }],
        instructions: ["Install Subversion with Homebrew: brew install subversion"]
      };
    }

    return {
      platform,
      commands: [],
      instructions: [
        "Install Homebrew from https://brew.sh, then install Subversion: brew install subversion"
      ]
    };
  }

  if (platform === "linux") {
    if (available.has("apt-get")) {
      const updateCommand = privilegedCommand(available, "apt-get", ["update"]);
      const installCommand = privilegedCommand(available, "apt-get", ["install", "-y", "subversion"]);
      return {
        platform,
        manager: "apt",
        commands: [updateCommand, installCommand],
        instructions: ["Install Subversion with apt: sudo apt-get update && sudo apt-get install -y subversion"]
      };
    }

    if (available.has("dnf")) {
      return linuxSingleCommandPlan(platform, available, "dnf", ["install", "-y", "subversion"]);
    }

    if (available.has("yum")) {
      return linuxSingleCommandPlan(platform, available, "yum", ["install", "-y", "subversion"]);
    }

    if (available.has("pacman")) {
      return linuxSingleCommandPlan(platform, available, "pacman", ["-Sy", "--noconfirm", "subversion"]);
    }

    if (available.has("zypper")) {
      return linuxSingleCommandPlan(platform, available, "zypper", ["install", "-y", "subversion"]);
    }

    if (available.has("apk")) {
      const command = privilegedCommand(available, "apk", ["add", "subversion"]);
      return {
        platform,
        manager: "apk",
        commands: [command],
        instructions: ["Install Subversion with apk: sudo apk add subversion"]
      };
    }

    return {
      platform,
      commands: [],
      instructions: [
        "Install Subversion with your system package manager, then rerun Pressship."
      ]
    };
  }

  if (platform === "win32") {
    if (available.has("winget")) {
      return {
        platform,
        manager: "winget",
        commands: [{ command: "winget", args: ["install", "--id", "Apache.Subversion", "-e"] }],
        instructions: ["Install Subversion with winget: winget install --id Apache.Subversion -e"]
      };
    }

    if (available.has("choco")) {
      return {
        platform,
        manager: "Chocolatey",
        commands: [{ command: "choco", args: ["install", "subversion", "-y"] }],
        instructions: ["Install Subversion with Chocolatey: choco install subversion -y"]
      };
    }

    return {
      platform,
      commands: [],
      instructions: [
        "Install Subversion for Windows, then make sure svn.exe is available on PATH."
      ]
    };
  }

  return {
    platform,
    commands: [],
    instructions: ["Install Subversion for your operating system, then rerun Pressship."]
  };
}

export function formatSubversionInstallInstructions(plan: SubversionInstallPlan): string {
  return [
    "Subversion (`svn`) is required, but it is not installed.",
    ...plan.instructions.map((instruction) => `- ${instruction}`)
  ].join("\n");
}

async function findAvailableInstallCommands(): Promise<Set<string>> {
  const found = new Set<string>();

  for (const command of INSTALL_COMMANDS) {
    if (await commandExists(command)) {
      found.add(command);
    }
  }

  return found;
}

async function commandExists(command: string): Promise<boolean> {
  const result =
    process.platform === "win32"
      ? await execa("where", [command], { reject: false, stdout: "ignore", stderr: "ignore" })
      : await execa("sh", ["-c", `command -v ${quoteShell(command)}`], {
          reject: false,
          stdout: "ignore",
          stderr: "ignore"
        });

  return result.exitCode === 0;
}

function linuxSingleCommandPlan(
  platform: NodeJS.Platform,
  available: Set<string>,
  manager: string,
  args: string[]
): SubversionInstallPlan {
  const command = privilegedCommand(available, manager, args);

  return {
    platform,
    manager,
    commands: [command],
    instructions: [`Install Subversion with ${manager}: sudo ${manager} ${args.join(" ")}`]
  };
}

function privilegedCommand(available: Set<string>, command: string, args: string[]): SubversionInstallCommand {
  return available.has("sudo") ? { command: "sudo", args: [command, ...args] } : { command, args };
}

function formatInstallCommands(commands: SubversionInstallCommand[]): string {
  return commands.map((command) => `${command.command} ${command.args.join(" ")}`).join(" && ");
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
