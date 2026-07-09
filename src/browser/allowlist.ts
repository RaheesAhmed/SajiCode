export function normalizeDomain(urlOrHost: string): string | null {
  try {
    const withProtocol = urlOrHost.includes("://") ? urlOrHost : `https://${urlOrHost}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isDomainAllowed(
  url: string,
  allowedDomains: string[] | undefined,
): { allowed: boolean; domain: string | null; reason?: string } {
  const domain = normalizeDomain(url);
  if (!domain) {
    return { allowed: false, domain: null, reason: "Invalid URL" };
  }

  if (!allowedDomains || allowedDomains.length === 0) {
    return {
      allowed: false,
      domain,
      reason: "No browser allowedDomains configured — set browser.allowedDomains in .sajicode/config.json",
    };
  }

  const allowed = allowedDomains.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      return domain.endsWith(suffix) || domain === pattern.slice(2);
    }
    return domain === pattern || domain.endsWith(`.${pattern}`);
  });

  if (!allowed) {
    return {
      allowed: false,
      domain,
      reason: `Domain "${domain}" not in allowlist: ${allowedDomains.join(", ")}`,
    };
  }

  return { allowed: true, domain };
}
