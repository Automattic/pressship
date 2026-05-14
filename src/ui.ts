import chalk from "chalk";
import ora, { type Ora } from "ora";

export const ui = {
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
