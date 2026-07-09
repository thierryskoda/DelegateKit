import type {
  OutlookMailMessageSendPayload,
  OutlookMailSendAttachment,
} from "./message-send-payload";

function outlookRecipients(addresses: readonly string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

type OutlookSendMailBody = {
  message: {
    subject: string;
    body: { contentType: "text"; content: string };
    toRecipients: { emailAddress: { address: string } }[];
    ccRecipients: { emailAddress: { address: string } }[];
    bccRecipients: { emailAddress: { address: string } }[];
    attachments?: OutlookFileAttachment[];
  };
  saveToSentItems: boolean;
};

type OutlookFileAttachment = {
  "@odata.type": "#microsoft.graph.fileAttachment";
  name: string;
  contentType: string;
  contentBytes: string;
};

function outlookAttachments(attachments: readonly OutlookMailSendAttachment[]): OutlookFileAttachment[] {
  return attachments.map((attachment) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: attachment.artifact.filename,
    contentType: attachment.artifact.mime_type || "application/octet-stream",
    contentBytes: Buffer.from(attachment.bytes).toString("base64"),
  }));
}

export function outlookSendMailBody(
  payload: OutlookMailMessageSendPayload,
  attachments: readonly OutlookMailSendAttachment[],
): OutlookSendMailBody {
  return {
    message: {
      subject: payload.subject,
      body: { contentType: "text", content: payload.bodyText },
      toRecipients: outlookRecipients(payload.to),
      ccRecipients: outlookRecipients(payload.cc),
      bccRecipients: outlookRecipients(payload.bcc),
      ...(attachments.length ? { attachments: outlookAttachments(attachments) } : {}),
    },
    saveToSentItems: true,
  };
}
