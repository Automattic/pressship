import type { Finding, ReadmeMetadata } from "../types.js";

const readmeHeaderMap: Record<string, keyof ReadmeMetadata> = {
  contributors: "contributors",
  tags: "tags",
  "requires at least": "requiresAtLeast",
  "tested up to": "testedUpTo",
  "stable tag": "stableTag",
  "requires php": "requiresPhp",
  license: "license",
  "license uri": "licenseUri"
};

export function parseReadme(contents: string): ReadmeMetadata {
  const lines = contents.split(/\r?\n/);
  const metadata: ReadmeMetadata = {};

  const title = lines.find((line) => /^===\s+.+?\s+===$/.test(line.trim()));
  if (title) {
    metadata.name = title.replace(/^===\s+/, "").replace(/\s+===$/, "").trim();
  }

  for (const line of lines) {
    const match = line.match(/^([^:\n]+):\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    const key = readmeHeaderMap[match[1].trim().toLowerCase()];
    if (!key) {
      continue;
    }

    const value = match[2].trim();
    if (key === "contributors" || key === "tags") {
      metadata[key] = splitCsv(value);
    } else {
      metadata[key] = value;
    }
  }

  return metadata;
}

export function validateReadmeLocally(contents: string, metadata: ReadmeMetadata): Finding[] {
  const findings: Finding[] = [];

  if (!metadata.name) {
    findings.push({
      severity: "error",
      code: "readme.missing_title",
      message: "readme.txt must start with a plugin title like `=== Plugin Name ===`."
    });
  }

  if (!metadata.contributors || metadata.contributors.length === 0) {
    findings.push({
      severity: "warning",
      code: "readme.missing_contributors",
      message: "readme.txt should include a Contributors header."
    });
  }

  if (!metadata.tags || metadata.tags.length === 0) {
    findings.push({
      severity: "warning",
      code: "readme.missing_tags",
      message: "readme.txt should include Tags for the plugin directory."
    });
  } else if (metadata.tags.length > 5) {
    findings.push({
      severity: "error",
      code: "readme.too_many_tags",
      message: "WordPress.org allows at most 5 readme tags."
    });
  }

  if (!metadata.stableTag) {
    findings.push({
      severity: "error",
      code: "readme.missing_stable_tag",
      message: "readme.txt must include a Stable tag header."
    });
  }

  if (!metadata.requiresAtLeast) {
    findings.push({
      severity: "warning",
      code: "readme.missing_requires_at_least",
      message: "readme.txt should include a Requires at least header."
    });
  }

  if (!metadata.testedUpTo) {
    findings.push({
      severity: "warning",
      code: "readme.missing_tested_up_to",
      message: "readme.txt should include a Tested up to header."
    });
  }

  if (!/^==\s+Description\s+==/im.test(contents)) {
    findings.push({
      severity: "warning",
      code: "readme.missing_description_section",
      message: "readme.txt should include a Description section."
    });
  }

  return findings;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
