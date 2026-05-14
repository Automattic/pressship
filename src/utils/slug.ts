export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function inferSlug(pluginName: string, textDomain?: string): string {
  const textDomainSlug = textDomain ? slugify(textDomain) : "";
  return textDomainSlug || slugify(pluginName);
}
