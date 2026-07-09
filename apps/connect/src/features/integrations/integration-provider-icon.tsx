import type { ReactNode } from "react";
import {
  Calendar,
  FileSignature,
  FolderOpen,
  HelpCircle,
  Kanban,
  ListTodo,
  Mail,
} from "lucide-react";
import boldsignIcon from "./icons/boldsign.svg";
import gmailIcon from "./icons/gmail.svg";
import googleIcon from "./icons/google.svg";
import googleCalendarIcon from "./icons/google-calendar.svg";
import googleDriveIcon from "./icons/google-drive.svg";
import mondayIcon from "./icons/monday.svg";
import onedriveIcon from "./icons/microsoft-onedrive.svg";
import outlookIcon from "./icons/microsoft-outlook.svg";
import sharepointIcon from "./icons/microsoft-sharepoint.svg";
import todoIcon from "./icons/microsoft-todo.svg";

const ICON_CLASS = "size-4.5 shrink-0 object-contain";

const PROVIDER_ICONS = {
  google: googleIcon,
  gmail: gmailIcon,
  outlook: outlookIcon,
  "outlook-mail": outlookIcon,
  "google-calendar": googleCalendarIcon,
  "outlook-calendar": outlookIcon,
  "google-drive": googleDriveIcon,
  "microsoft-onedrive": onedriveIcon,
  "microsoft-sharepoint": sharepointIcon,
  "microsoft-todo": todoIcon,
  monday: mondayIcon,
  boldsign: boldsignIcon,
} as const satisfies Record<string, string>;

function capabilityFallbackIcon(capabilitySlug: string): ReactNode {
  const css = `${ICON_CLASS} text-secondary`;
  switch (capabilitySlug) {
    case "gmail":
    case "outlook-mail":
      return <Mail className={css} aria-hidden="true" />;
    case "google-calendar":
    case "outlook-calendar":
      return <Calendar className={css} aria-hidden="true" />;
    case "google-drive":
    case "microsoft-onedrive":
    case "microsoft-sharepoint":
      return <FolderOpen className={css} aria-hidden="true" />;
    case "monday":
      return <Kanban className={css} aria-hidden="true" />;
    case "microsoft-todo":
      return <ListTodo className={css} aria-hidden="true" />;
    case "boldsign":
      return <FileSignature className={css} aria-hidden="true" />;
    default:
      return <HelpCircle className={css} aria-hidden="true" />;
  }
}

export function IntegrationProviderIcon({
  provider,
  capabilitySlug,
  className = ICON_CLASS,
}: {
  provider: string;
  capabilitySlug: string;
  className?: string;
}) {
  const src = PROVIDER_ICONS[provider as keyof typeof PROVIDER_ICONS];

  if (!src) {
    return capabilityFallbackIcon(capabilitySlug);
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      draggable={false}
      src={src}
    />
  );
}
