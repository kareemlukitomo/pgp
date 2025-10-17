import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Asset = {
  key: string;
  value: string;
  metadata: {
    contentType: string;
  };
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");

const assetEntries: Array<
  | { fsPath: string; kvKey: string }
  | { fsPath: string; kvPrefix: string }
> = [
  { fsPath: "public-masterkey.asc", kvKey: "/public-masterkey.asc" },
  { fsPath: "shaquille.asc", kvKey: "/shaquille.asc" },
  { fsPath: "policy", kvKey: "/policy" },
  { fsPath: ".well-known/openpgpkey", kvPrefix: "/.well-known/openpgpkey" },
];

async function main(): Promise<void> {
  const dest = resolveOutputPath();
  const assets: Asset[] = [];

  for (const entry of assetEntries) {
    const absolute = path.join(repoRoot, entry.fsPath);
    const exists = await existsPath(absolute);
    if (!exists) {
      continue;
    }

    if ("kvKey" in entry) {
      const asset = await loadAsset(absolute, entry.kvKey);
      assets.push(asset);
      continue;
    }

    const collected = await loadDirectoryAssets(absolute, entry.kvPrefix);
    assets.push(...collected);
  }

  const json = JSON.stringify(assets, null, 2);

  if (dest) {
    await ensureParent(dest);
    await writeFile(dest, json, "utf8");
    console.log(`Wrote ${assets.length} assets to ${dest}`);
  } else {
    process.stdout.write(json);
  }
}

function resolveOutputPath(): string | null {
  const flagIndex = process.argv.indexOf("--out");
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.cwd(), process.argv[flagIndex + 1]);
  }
  return null;
}

async function existsPath(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function loadAsset(fsPath: string, kvKey: string): Promise<Asset> {
  const content = await readFile(fsPath, "utf8");
  return {
    key: kvKey,
    value: content,
    metadata: {
      contentType: inferContentType(kvKey),
    },
  };
}

async function loadDirectoryAssets(
  directory: string,
  prefix: string,
): Promise<Asset[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets: Asset[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedPrefix = `${prefix}/${entry.name}`;
      const nested = await loadDirectoryAssets(absolute, nestedPrefix);
      assets.push(...nested);
    } else if (entry.isFile()) {
      const kvKey = `${prefix}/${entry.name}`;
      const asset = await loadAsset(absolute, kvKey);
      assets.push(asset);
    }
  }

  return assets;
}

function inferContentType(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (
    lower.endsWith("policy") ||
    lower.endsWith("host") ||
    lower.endsWith(".txt")
  ) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

async function ensureParent(filePath: string): Promise<void> {
  const parent = path.dirname(filePath);
  await mkdir(parent, { recursive: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
