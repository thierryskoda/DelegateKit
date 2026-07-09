type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function isTelegramMiniApp(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData?.trim());
}

export function telegramMiniAppInitData(): string | null {
  const webApp = window.Telegram?.WebApp;
  const initData = webApp?.initData?.trim();
  if (!initData) return null;
  webApp?.ready?.();
  webApp?.expand?.();
  return initData;
}

export function openTelegramExternalLink(url: string): void {
  const openLink = window.Telegram?.WebApp?.openLink;
  if (openLink) {
    openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
