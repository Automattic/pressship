import { createServer } from "node:net";

export async function resolveFreePort(
  host: string,
  startPort: number,
  strict: boolean,
  endPort = startPort + 25
): Promise<number> {
  if (startPort === 0) {
    return probePort(host, 0);
  }

  for (let port = startPort; port <= endPort; port += 1) {
    if (await isPortAvailable(host, port)) {
      return port;
    }
    if (strict) {
      break;
    }
  }

  throw new Error(
    strict
      ? `Port ${startPort} is already in use on ${host}.`
      : `No available port found between ${startPort} and ${endPort} on ${host}.`
  );
}

export async function isPortAvailable(host: string, port: number): Promise<boolean> {
  try {
    await probePort(host, port);
    return true;
  } catch {
    return false;
  }
}

async function probePort(host: string, port: number): Promise<number> {
  const server = createServer();
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      server.close((error) => (error ? reject(error) : resolve(resolvedPort)));
    });
  });
}
