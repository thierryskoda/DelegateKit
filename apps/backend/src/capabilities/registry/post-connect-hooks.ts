import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { googleCalendarNangoPostConnectHook } from "../google-calendar/post-connect-hooks";
import { googleDriveNangoPostConnectHook } from "../google-drive/post-connect-hooks";
import { outlookCalendarNangoPostConnectHook } from "../outlook-calendar/post-connect-hooks";
import { gmailNangoPostConnectHook } from "../gmail/post-connect-hooks";
import { outlookMailNangoPostConnectHook } from "../outlook-mail/post-connect-hooks";
import { mondayNangoPostConnectHook } from "../monday/post-connect-hook";
import { microsoftOnedriveNangoPostConnectHook } from "../microsoft-onedrive/post-connect-hooks";
import { microsoftSharepointNangoPostConnectHook } from "../microsoft-sharepoint/post-connect-hooks";

type NangoPostConnectHookInput = {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  providerConfigKey: string;
  connectionId: string;
  link: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
};

type NangoPostConnectHookResult = {
  skipReadinessEvaluation?: boolean;
};

export type NangoPostConnectHook = (
  input: NangoPostConnectHookInput,
) => Promise<NangoPostConnectHookResult | void>;

export const nangoPostConnectHooks: readonly NangoPostConnectHook[] = [
  mondayNangoPostConnectHook,
  gmailNangoPostConnectHook,
  outlookMailNangoPostConnectHook,
  googleCalendarNangoPostConnectHook,
  outlookCalendarNangoPostConnectHook,
  googleDriveNangoPostConnectHook,
  microsoftOnedriveNangoPostConnectHook,
  microsoftSharepointNangoPostConnectHook,
];
