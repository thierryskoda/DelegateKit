function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildPhoneCallAnswerTwiML(input: {
  openingLine: string;
  gatherActionUrl: string;
  timeoutSeconds: number;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Gather input="speech dtmf" action="${escapeXml(input.gatherActionUrl)}" method="POST" timeout="${input.timeoutSeconds}" speechTimeout="auto" actionOnEmptyResult="true">`,
    `<Say>${escapeXml(input.openingLine)}</Say>`,
    "</Gather>",
    "<Say>I did not hear a response. I will follow up another way. Goodbye.</Say>",
    "<Hangup/>",
    "</Response>",
  ].join("");
}

export function buildPhoneCallTerminalTwiML(input: { spoken: string }): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say>${escapeXml(input.spoken)}</Say>`,
    "<Hangup/>",
    "</Response>",
  ].join("");
}
