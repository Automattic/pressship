import { z } from "zod";
import { ui } from "../ui.js";
import { openUrl } from "./open-url.js";
import { startWebServer } from "./server.js";

const studioOptionsSchema = z.object({
  host: z.string().optional(),
  port: z.string().optional(),
  open: z.boolean().default(true)
});

export type StudioOptions = z.input<typeof studioOptionsSchema>;

export async function studio(rawOptions: StudioOptions = {}): Promise<void> {
  const options = studioOptionsSchema.parse(rawOptions);
  ui.logo();
  const server = await startWebServer({
    host: options.host,
    port: options.port,
    noOpen: !options.open
  });

  ui.intro("Pressship Studio");
  ui.keyValue("URL", ui.path(server.url));
  ui.keyValue("Host", options.host ?? "127.0.0.1");
  ui.info("Press Ctrl+C to stop Pressship Studio.");

  if (options.open) {
    await openUrl(server.url).catch((error) => {
      ui.warn(`Could not open the browser automatically. ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  await new Promise<void>((resolve) => {
    const close = () => {
      void server.close().finally(resolve);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}
