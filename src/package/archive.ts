import { createWriteStream } from "node:fs";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { ZipFile } from "yazl";
import type { PackageResult, PluginProject } from "../types.js";
import { getDefaultBuildDir } from "../utils/paths.js";
import { createIgnoreFilter } from "./ignore.js";

const maxSubmissionSizeBytes = 10 * 1024 * 1024;

export type PackageOptions = {
  outputDir?: string;
  ignore?: string[];
};

export type StageResult = {
  path: string;
  files: string[];
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

  if (zipStat.size > maxSubmissionSizeBytes) {
    throw new Error(
      `Submission zip is larger than 10 MB (${zipStat.size} bytes). WordPress.org requires uploads under 10 MB.`
    );
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
    unique: true
  });

  return files.filter(includeFile).sort();
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
