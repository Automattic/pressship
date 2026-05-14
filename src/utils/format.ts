export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function summarizeList(values: string[], limit = 12): string {
  if (values.length <= limit) {
    return values.join("\n");
  }

  const visible = values.slice(0, limit).join("\n");
  return `${visible}\n...and ${values.length - limit} more`;
}
