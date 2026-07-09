function prefersMobileFullPageNavigation(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function openExternalUrl(url: string): void {
  if (prefersMobileFullPageNavigation()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
