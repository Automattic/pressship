import { clearBrowserSession } from "./session.js";
import { ui } from "../ui.js";

export async function logout(): Promise<void> {
  ui.intro("Logout");
  const removed = await clearBrowserSession();

  if (removed) {
    ui.success("Logged out of Pressship. Saved WordPress.org browser session removed.");
    return;
  }

  ui.info("No saved WordPress.org browser session found.");
}
