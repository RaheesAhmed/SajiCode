const ENV_LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

const SECRET_PATH_PATTERN =
  /(?:^|[/\\])\.env(?:\.|$)|credentials|secrets?\.(?:json|ya?ml|toml)|(?:^|[/\\])\.npmrc$/i;

export function isSecretFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return SECRET_PATH_PATTERN.test(normalized);
}

/** Redact assignment values in env-style files — keys stay visible for debugging. */
export function redactSecretFileContent(content: string, filePath: string): string {
  if (!isSecretFilePath(filePath)) return content;

  return content
    .split("\n")
    .map((line) => {
      const match = line.match(ENV_LINE);
      if (!match) return line;
      const [, prefix, key] = match;
      const rawValue = match[3] ?? "";
      const trimmed = rawValue.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return line;
      return `${prefix}${key}=[REDACTED]`;
    })
    .join("\n");
}

export function redactInlineSecrets(content: string): string {
  let out = content;
  out = out.replace(
    /((?:api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*["']?)([^\s"'`,}\]]+)/gi,
    "$1[REDACTED]",
  );
  out = out.replace(
    /(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
    "$1[REDACTED]",
  );
  return out;
}
