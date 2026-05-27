import { execa } from "execa";

export async function openUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await execa("open", [url]);
    return;
  }

  if (process.platform === "win32") {
    await execa("cmd", ["/c", "start", "", url]);
    return;
  }

  await execa("xdg-open", [url]);
}
