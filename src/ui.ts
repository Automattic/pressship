import chalk from "chalk";
import ora, { type Ora } from "ora";

const pressshipLogoPixels = [
  "BBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "BBBBB               BBBBBBBB",
  "BBBBB                 BBBBBBB",
  "BBBBB                  BBBBBB",
  "BBBBB   II              BBBBB",
  "BBBBB   IIII            BBBBBB",
  "BBBBB   IIIII            BBBBB",
  "BBBBB    IIIII           BBBBB",
  "BBBBB     IIIII          BBBBB",
  "BBBBB      IIII          BBBBB",
  "BBBBB      IIII          BBBBB",
  "BBBBB     IIII           BBBBB",
  "BBBBB   IIIII            BBBBB",
  "BBBBB   IIII            BBBBBB",
  "BBBBB   III            BBBBBB",
  "BBBBB                  BBBBBB",
  "BBBBB                BBBBBBB",
  "BBBBB                BBBBBB",
  "BBBBB   IIIIIIIIII   BBBBBB",
  "BBBBB   IIIIIIIIIII  BBBBB",
  "BBBBB   IIIIIIIIIII   BB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  "BBBBB"
];

export const ui = {
  logo(): void {
    console.log(renderPressshipLogo());
  },

  intro(title: string): void {
    console.log(`\n${chalk.bold.cyan("Pressship")} ${chalk.dim("•")} ${chalk.bold(title)}\n`);
  },

  section(title: string): void {
    console.log(`\n${chalk.bold(title)}`);
  },

  info(message: string): void {
    console.log(`${chalk.cyan("ℹ")} ${message}`);
  },

  success(message: string): void {
    console.log(`${chalk.green("✓")} ${message}`);
  },

  warn(message: string): void {
    console.log(`${chalk.yellow("!")} ${message}`);
  },

  error(message: string): void {
    console.log(`${chalk.red("✖")} ${message}`);
  },

  muted(message: string): string {
    return chalk.dim(message);
  },

  path(value: string): string {
    return chalk.cyan(value);
  },

  value(value: string): string {
    return chalk.green(value);
  },

  keyValue(label: string, value: string): void {
    console.log(`  ${chalk.dim(label.padEnd(12))} ${value}`);
  },

  spinner(text: string): Ora {
    return ora({ text, color: "cyan" }).start();
  },

  async task<T>(text: string, action: () => Promise<T>, successText?: (value: T) => string): Promise<T> {
    const spinner = ui.spinner(text);

    try {
      const result = await action();
      spinner.succeed(successText ? successText(result) : text);
      return result;
    } catch (error) {
      spinner.fail(text);
      throw error;
    }
  }
};

function renderPressshipLogo(): string {
  const width = Math.max(...pressshipLogoPixels.map((line) => line.length));
  const lines = [""];

  for (let row = 0; row < pressshipLogoPixels.length; row += 2) {
    let output = "  ";
    for (let column = 0; column < width; column += 1) {
      output += renderLogoCell(pixelAt(row, column), pixelAt(row + 1, column));
    }
    lines.push(output.trimEnd());
  }

  lines.push("");
  return lines.join("\n");
}

function pixelAt(row: number, column: number): string {
  return pressshipLogoPixels[row]?.[column] ?? " ";
}

function renderLogoCell(top: string, bottom: string): string {
  if (top === " " && bottom === " ") {
    return " ";
  }
  if (top === bottom) {
    return logoColor(top)("█");
  }
  if (bottom === " ") {
    return logoColor(top)("▀");
  }
  if (top === " ") {
    return logoColor(bottom)("▄");
  }
  return chalk.hex(logoColorValue(top)).bgHex(logoColorValue(bottom))("▀");
}

function logoColor(pixel: string) {
  return chalk.hex(logoColorValue(pixel));
}

function logoColorValue(pixel: string): string {
  return pixel === "I" ? "#f8fafc" : "#315bff";
}
