import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import fg from "fast-glob";
import { ZipFile } from "yazl";
import type { PackageResult, PluginProject } from "../types.js";
import { formatBytes } from "../utils/format.js";
import { getDefaultBuildDir } from "../utils/paths.js";
import { createIgnoreFilter, hardIgnorePatterns } from "./ignore.js";

export const maxSubmissionSizeBytes = 10 * 1024 * 1024;

export type PackageOptions = {
  outputDir?: string;
  ignore?: string[];
  allowOversize?: boolean;
};

export type StageResult = {
  path: string;
  files: string[];
};

export type PackageFileSize = {
  path: string;
  sizeBytes: number;
};

export type PackageAnalysis = PackageResult & {
  maxSizeBytes: number;
  overLimit: boolean;
  largestFiles: PackageFileSize[];
};

export async function createPluginZip(
  project: PluginProject,
  options: PackageOptions = {}
): Promise<PackageResult> {
  const outputDir = path.resolve(options.outputDir ?? getDefaultBuildDir());
  await mkdir(outputDir, { recursive: true });

  const zipPath = path.join(outputDir, `${project.slug}.zip`);
  const files = await listPackageFiles(project.rootDir, { ignore: options.ignore });
  await writeZip(project.rootDir, project.slug, files, zipPath);
  const zipStat = await stat(zipPath);

  if (!options.allowOversize && zipStat.size > maxSubmissionSizeBytes) {
    throw new Error(await oversizedPackageMessage(project.rootDir, files, zipStat.size));
  }

  return {
    zipPath,
    sizeBytes: zipStat.size,
    files,
    topLevelFolder: project.slug
  };
}

export async function listPackageFiles(
  rootDir: string,
  options: Pick<PackageOptions, "ignore"> = {}
): Promise<string[]> {
  const includeFile = await createIgnoreFilter(rootDir, options.ignore);
  const files = await fg("**/*", {
    cwd: rootDir,
    onlyFiles: true,
    dot: true,
    unique: true,
    ignore: hardIgnorePatterns
  });

  return files.filter(includeFile).sort();
}

export async function analyzePluginPackage(
  project: PluginProject,
  options: Pick<PackageOptions, "ignore"> = {}
): Promise<PackageAnalysis> {
  const outputDir = await mkdtemp(path.join(tmpdir(), "pressship-package-analysis-"));
  try {
    const result = await createPluginZip(project, {
      outputDir,
      ignore: options.ignore,
      allowOversize: true
    });
    return {
      ...result,
      maxSizeBytes: maxSubmissionSizeBytes,
      overLimit: result.sizeBytes > maxSubmissionSizeBytes,
      largestFiles: await largestPackageFiles(project.rootDir, result.files)
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export async function stagePluginDirectory(
  project: PluginProject,
  options: PackageOptions = {}
): Promise<StageResult> {
  const stageRoot = path.join(path.resolve(options.outputDir ?? getDefaultBuildDir()), "plugin-check");
  const stagePath = path.join(stageRoot, project.slug);
  const files = await listPackageFiles(project.rootDir, { ignore: options.ignore });

  await rm(stagePath, { recursive: true, force: true });
  await mkdir(stagePath, { recursive: true });

  for (const file of files) {
    const source = path.join(project.rootDir, file);
    const destination = path.join(stagePath, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }

  return { path: stagePath, files };
}

async function writeZip(
  rootDir: string,
  topLevelFolder: string,
  files: string[],
  zipPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipFile();

    output.on("close", resolve);
    output.on("error", reject);
    archive.outputStream.on("error", reject);
    archive.outputStream.pipe(output);

    for (const relativePath of files) {
      archive.addFile(
        path.join(rootDir, relativePath),
        path.posix.join(topLevelFolder, relativePath.split(path.sep).join("/"))
      );
    }

    archive.end();
  });
}

async function oversizedPackageMessage(rootDir: string, files: string[], sizeBytes: number): Promise<string> {
  const largestFiles = await largestPackageFiles(rootDir, files, 5);
  const largestSummary = largestFiles.length
    ? ` Largest included files: ${largestFiles
        .map((file) => `${file.path} (${formatBytes(file.sizeBytes)})`)
        .join(", ")}.`
    : "";
  return `Submission zip is larger than 10 MB (${formatBytes(sizeBytes)} / ${sizeBytes} bytes). WordPress.org requires uploads under 10 MB.${largestSummary} Add non-release files to .pressshipignore or pass --ignore=<glob>.`;
}

async function largestPackageFiles(rootDir: string, files: string[], limit = 8): Promise<PackageFileSize[]> {
  const sizes = await Promise.all(
    files.map(async (file) => ({
      path: file,
      sizeBytes: (await stat(path.join(rootDir, file))).size
    }))
  );
  return sizes.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
}
