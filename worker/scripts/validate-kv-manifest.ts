import { readFile } from "node:fs/promises";
import path from "node:path";

type Asset = {
  key: string;
  value: string;
  base64?: boolean;
  metadata?: {
    contentType?: string;
  };
};

const WKD_USER_KEY_REGEX =
  /^\/\.well-known\/openpgpkey\/hu\/([^/]+)\/([^/]+)\.pub$/;
const WKD_SHARED_FILES = ["host", "policy"] as const;

async function main(): Promise<void> {
  const manifestPath = resolveManifestPath();
  const raw = await readFile(manifestPath, "utf8");
  const assets = JSON.parse(raw) as Asset[];
  const keys = new Set<string>();

  for (const asset of assets) {
    if (!asset.key || typeof asset.value !== "string") {
      throw new Error("Invalid manifest entry: key/value is required");
    }
    if (asset.base64 !== true) {
      throw new Error(`Manifest entry is not base64-encoded: ${asset.key}`);
    }
    keys.add(asset.key);
  }

  const userKeys = assets.filter((entry) => WKD_USER_KEY_REGEX.test(entry.key));
  if (userKeys.length === 0) {
    throw new Error("No WKD user key entries found in manifest");
  }

  const domains = new Set<string>();
  for (const entry of userKeys) {
    const match = entry.key.match(WKD_USER_KEY_REGEX);
    if (!match) {
      continue;
    }

    const hashedLocalPart = match[1];
    const domain = getEmailDomain(match[2]);
    if (!domain) {
      throw new Error(`Invalid WKD user filename: ${entry.key}`);
    }

    domains.add(domain);
    const requiredAliases = [
      `/.well-known/openpgpkey/hu/${hashedLocalPart}`,
      `/.well-known/openpgpkey/${domain}/hu/${hashedLocalPart}`,
    ];

    for (const alias of requiredAliases) {
      if (!keys.has(alias)) {
        throw new Error(
          `Missing WKD alias "${alias}" derived from "${entry.key}"`,
        );
      }
    }
  }

  for (const fileName of WKD_SHARED_FILES) {
    const sourceKey = `/.well-known/openpgpkey/${fileName}`;
    if (!keys.has(sourceKey)) {
      continue;
    }

    for (const domain of domains) {
      const alias = `/.well-known/openpgpkey/${domain}/${fileName}`;
      if (!keys.has(alias)) {
        throw new Error(
          `Missing WKD shared alias "${alias}" derived from "${sourceKey}"`,
        );
      }
    }
  }

  console.log(
    `Manifest validation passed: ${assets.length} assets, ${userKeys.length} WKD user keys`,
  );
}

function getEmailDomain(email: string): string | null {
  const normalized = email.toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

function resolveManifestPath(): string {
  const flagIndex = process.argv.indexOf("--manifest");
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.cwd(), process.argv[flagIndex + 1]);
  }

  return path.resolve(process.cwd(), "dist/kv-assets.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
