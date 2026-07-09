import { boldSignSignatureRequestWebhookAdapter } from "../boldsign/webhook-adapter";
import { googleCalendarWebhookAdapter } from "../google-calendar/adapter";
import { googleDriveWebhookAdapter } from "../google-drive/adapter";
import { outlookCalendarWebhookAdapter } from "../outlook-calendar/adapter";
import { gmailMailboxWebhookAdapter } from "../gmail/adapter";
import { microsoftOnedriveWebhookAdapter } from "../microsoft-onedrive/adapter";
import { microsoftSharepointWebhookAdapter } from "../microsoft-sharepoint/adapter";
import { outlookMailWebhookAdapter } from "../outlook-mail/adapter";
import { mondayBoardWebhookAdapter } from "../monday/webhook-adapter";
import { twilioMessagingWebhookAdapter } from "../phone/sms/twilio-webhooks";
import type { ProviderWebhookAdapter } from "../../integrations/provider-webhooks/substrate";

export const providerWebhookAdapters: readonly ProviderWebhookAdapter[] = [
  boldSignSignatureRequestWebhookAdapter,
  gmailMailboxWebhookAdapter,
  outlookMailWebhookAdapter,
  twilioMessagingWebhookAdapter,
  googleCalendarWebhookAdapter,
  outlookCalendarWebhookAdapter,
  mondayBoardWebhookAdapter,
  googleDriveWebhookAdapter,
  microsoftOnedriveWebhookAdapter,
  microsoftSharepointWebhookAdapter,
];
