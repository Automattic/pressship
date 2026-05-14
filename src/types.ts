export type Severity = "error" | "warning" | "info";

export type Finding = {
  severity: Severity;
  message: string;
  code?: string;
  file?: string;
  line?: number;
  column?: number;
};

export type PluginHeaders = {
  pluginName: string;
  pluginUri?: string;
  description?: string;
  version?: string;
  author?: string;
  authorUri?: string;
  textDomain?: string;
  domainPath?: string;
  requiresAtLeast?: string;
  requiresPhp?: string;
  updateUri?: string;
  license?: string;
  licenseUri?: string;
};

export type ReadmeMetadata = {
  name?: string;
  contributors?: string[];
  tags?: string[];
  requiresAtLeast?: string;
  testedUpTo?: string;
  stableTag?: string;
  requiresPhp?: string;
  license?: string;
  licenseUri?: string;
};

export type PluginProject = {
  rootDir: string;
  mainFile: string;
  headers: PluginHeaders;
  readmePath?: string;
  readme?: ReadmeMetadata;
  slug: string;
  version?: string;
};

export type PackageResult = {
  zipPath: string;
  sizeBytes: number;
  files: string[];
  topLevelFolder: string;
};

export type CommandPlan = {
  command: string;
  args: string[];
  cwd?: string;
};
