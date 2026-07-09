export function outlookCalendarLimitations(conferencePreference?: "provider_default" | "none") {
  if (conferencePreference !== "provider_default") return [];
  return [
    {
      code: "provider_capability_limited",
      scope: "conference",
      detail:
        "Outlook online meeting creation depends on the connected account's Graph permissions and tenant policy.",
    },
  ];
}
