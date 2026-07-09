import { create } from "zustand";

const NOTICE_AUTO_DISMISS_MS = 8_000;

type ConnectNoticeTone = "success" | "error" | "info";

type ConnectNotice = {
  id: string;
  tone: ConnectNoticeTone;
  message: string;
};

type ConnectUiState = {
  notice: ConnectNotice | null;
  setNotice: (notice: Omit<ConnectNotice, "id">) => void;
  clearNotice: () => void;
};

let noticeDismissTimer: ReturnType<typeof setTimeout> | undefined;

function clearNoticeDismissTimer() {
  if (noticeDismissTimer !== undefined) {
    clearTimeout(noticeDismissTimer);
    noticeDismissTimer = undefined;
  }
}

export const useConnectUiStore = create<ConnectUiState>()((set, get) => ({
  notice: null,
  setNotice: (notice) => {
    clearNoticeDismissTimer();
    const id = crypto.randomUUID();
    set({ notice: { ...notice, id } });
    noticeDismissTimer = setTimeout(() => {
      if (get().notice?.id === id) {
        set({ notice: null });
      }
      noticeDismissTimer = undefined;
    }, NOTICE_AUTO_DISMISS_MS);
  },
  clearNotice: () => {
    clearNoticeDismissTimer();
    set({ notice: null });
  },
}));
