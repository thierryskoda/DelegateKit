import { profileTimeResolveInputSchema } from "@ai-assistants/time-contracts/schemas";
import { timeToolContracts } from "@ai-assistants/time-contracts/contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData } from "../../shared/tool-result";

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
};

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch (cause) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Invalid profile timezone: ${timezone}.`, {
      cause,
      details: { timezone },
    });
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Intl formatter did not return ${type}.`);
  return value;
}

function localDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: Number(partValue(parts, "year")),
    month: Number(partValue(parts, "month")),
    day: Number(partValue(parts, "day")),
    hour: Number(partValue(parts, "hour")),
    minute: Number(partValue(parts, "minute")),
  };
}

function parseLocalDate(value: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Invalid local date: ${value}.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (normalized !== value) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Invalid local date: ${value}.`);
  }
  return { year, month, day };
}

function formatLocalDate(parts: LocalDateParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addLocalDays(date: LocalDateParts, days: number): LocalDateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function localMidnightToUtcInstant(localDate: string, timezone: string): string {
  const date = parseLocalDate(localDate);
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, 0, 0);
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localDateTimeParts(new Date(candidate), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const diff = desiredAsUtc - observedAsUtc;
    candidate += diff;
    if (diff === 0) return new Date(candidate).toISOString();
  }

  return new Date(candidate).toISOString();
}

function instantLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function monthLabel(year: number, month: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

function intervalResult(input: {
  kind: "local_date" | "local_date_range" | "month" | "relative_date";
  localStartDate: string;
  localEndDateExclusive: string;
  timezone: string;
  label: string;
}) {
  return {
    kind: input.kind,
    localStartDate: input.localStartDate,
    localEndDateExclusive: input.localEndDateExclusive,
    utcStart: localMidnightToUtcInstant(input.localStartDate, input.timezone),
    utcEndExclusive: localMidnightToUtcInstant(input.localEndDateExclusive, input.timezone),
    label: input.label,
  };
}

function resolveInstant(instant: string, timezone: string) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Invalid instant: ${instant}.`);
  }
  const local = localDateTimeParts(date, timezone);
  const localDate = formatLocalDate(local);
  const localTime = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  return {
    kind: "instant" as const,
    instant: date.toISOString(),
    localDate,
    localTime,
    localDateTime: `${localDate} ${localTime}`,
    label: instantLabel(date, timezone),
  };
}

function resolveRelativeDate(
  value: "today" | "yesterday" | "tomorrow",
  timezone: string,
  now: Date,
) {
  const today = localDateTimeParts(now, timezone);
  const offset = value === "yesterday" ? -1 : value === "tomorrow" ? 1 : 0;
  const target = addLocalDays(today, offset);
  const targetDate = formatLocalDate(target);
  return intervalResult({
    kind: "relative_date",
    localStartDate: targetDate,
    localEndDateExclusive: formatLocalDate(addLocalDays(target, 1)),
    timezone,
    label: value,
  });
}

export const timeResolveHandlers = {
  async time_resolve(ctx) {
    const parsed = profileTimeResolveInputSchema.parse(ctx.params);
    const timezone = ctx.profile.timezone;
    assertValidTimezone(timezone);
    const now = new Date();

    return backendToolData(timeToolContracts, "time_resolve", {
      timezone,
      resolvedAt: now.toISOString(),
      results: parsed.queries.map((query) => {
        switch (query.kind) {
          case "instant":
            return resolveInstant(query.instant, timezone);
          case "local_date": {
            const start = query.date;
            return intervalResult({
              kind: "local_date",
              localStartDate: start,
              localEndDateExclusive: formatLocalDate(addLocalDays(parseLocalDate(start), 1)),
              timezone,
              label: start,
            });
          }
          case "local_date_range":
            return intervalResult({
              kind: "local_date_range",
              localStartDate: query.startDate,
              localEndDateExclusive: query.endDateExclusive,
              timezone,
              label: `${query.startDate} to ${query.endDateExclusive} exclusive`,
            });
          case "month": {
            const start = formatLocalDate({ year: query.year, month: query.month, day: 1 });
            const end =
              query.month === 12
                ? formatLocalDate({ year: query.year + 1, month: 1, day: 1 })
                : formatLocalDate({ year: query.year, month: query.month + 1, day: 1 });
            return intervalResult({
              kind: "month",
              localStartDate: start,
              localEndDateExclusive: end,
              timezone,
              label: monthLabel(query.year, query.month, timezone),
            });
          }
          case "relative_date":
            return resolveRelativeDate(query.value, timezone, now);
          default: {
            const _exhaustive: never = query;
            return _exhaustive;
          }
        }
      }),
    });
  },
} satisfies BackendImmediateToolHandlers<typeof timeToolContracts>;
