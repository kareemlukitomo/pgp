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

  const userKeyRegex =
    /^\/\.well-known\/openpgpkey\/hu\/([^/]+)\/([^/]+)\.pub$/;
  const userKeys = assets.filter((entry) => userKeyRegex.test(entry.key));
  if (userKeys.length === 0) {
    throw new Error("No WKD user key entries found in manifest");
  }

  for (const entry of userKeys) {
    const match = entry.key.match(userKeyRegex);
    if (!match) {
      continue;
    }

    const hashedLocalPart = match[1];
    const email = match[2].toLowerCase();
    const atIndex = email.lastIndexOf("@");
    if (atIndex === -1 || atIndex === email.length - 1) {
      throw new Error(`Invalid WKD user filename: ${entry.key}`);
    }

    const domain = email.slice(atIndex + 1);
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

  console.log(
    `Manifest validation passed: ${assets.length} assets, ${userKeys.length} WKD user keys`,
  );
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
