import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Asset = {
  key: string;
  value: string;
  base64: true;
  metadata: {
    contentType: string;
  };
};

const WKD_USER_KEY_REGEX =
  /^\/\.well-known\/openpgpkey\/hu\/([^/]+)\/([^/]+)\.pub$/;
const WKD_SHARED_FILES = ["host", "policy"] as const;

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
  const assets = new Map<string, Asset>();

  for (const entry of assetEntries) {
    const absolute = path.join(repoRoot, entry.fsPath);
    const exists = await existsPath(absolute);
    if (!exists) {
      continue;
    }

    if ("kvKey" in entry) {
      const asset = await loadAsset(absolute, entry.kvKey);
      registerAsset(assets, asset);
      continue;
    }

    const collected = await loadDirectoryAssets(absolute, entry.kvPrefix);
    for (const asset of collected) {
      registerAsset(assets, asset);
    }
  }

  for (const asset of buildWkdSharedAliases(assets)) {
    registerAsset(assets, asset);
  }

  const json = JSON.stringify(Array.from(assets.values()), null, 2);

  if (dest) {
    await ensureParent(dest);
    await writeFile(dest, json, "utf8");
    console.log(`Wrote ${assets.size} assets to ${dest}`);
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
  const content = await readFile(fsPath);
  return {
    key: kvKey,
    value: content.toString("base64"),
    base64: true,
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
      assets.push(...buildWkdAliases(asset));
    }
  }

  return assets;
}

function buildWkdAliases(asset: Asset): Asset[] {
  const match = asset.key.match(WKD_USER_KEY_REGEX);
  if (!match) {
    return [];
  }

  const hashedLocalPart = match[1];
  const domain = getEmailDomain(match[2]);
  if (!domain) {
    return [];
  }

  const aliases = [
    `/.well-known/openpgpkey/hu/${hashedLocalPart}`,
    `/.well-known/openpgpkey/${domain}/hu/${hashedLocalPart}`,
  ];

  return aliases.map((aliasKey) => ({
    ...asset,
    key: aliasKey,
  }));
}

function buildWkdSharedAliases(
  assets: ReadonlyMap<string, Asset>,
): Asset[] {
  const domains = collectWkdDomains(assets.values());
  if (domains.length === 0) {
    return [];
  }

  const aliases: Asset[] = [];
  for (const fileName of WKD_SHARED_FILES) {
    const sourceKey = `/.well-known/openpgpkey/${fileName}`;
    const sourceAsset = assets.get(sourceKey);
    if (!sourceAsset) {
      continue;
    }

    for (const domain of domains) {
      aliases.push({
        ...sourceAsset,
        key: `/.well-known/openpgpkey/${domain}/${fileName}`,
      });
    }
  }

  return aliases;
}

function collectWkdDomains(assets: Iterable<Asset>): string[] {
  const domains = new Set<string>();

  for (const asset of assets) {
    const match = asset.key.match(WKD_USER_KEY_REGEX);
    if (!match) {
      continue;
    }

    const domain = getEmailDomain(match[2]);
    if (domain) {
      domains.add(domain);
    }
  }

  return Array.from(domains).sort();
}

function getEmailDomain(email: string): string | null {
  const normalized = email.toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
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

function registerAsset(
  target: Map<string, Asset>,
  incoming: Asset,
): void {
  const existing = target.get(incoming.key);
  if (!existing) {
    target.set(incoming.key, incoming);
    return;
  }

  if (
    existing.value !== incoming.value ||
    existing.metadata.contentType !== incoming.metadata.contentType
  ) {
    throw new Error(
      `Conflicting asset definitions for key "${incoming.key}"`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
