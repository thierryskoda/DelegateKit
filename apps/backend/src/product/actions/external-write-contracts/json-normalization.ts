export function stripUndefinedProperties<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedProperties(entry)) as T;
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedProperties(entry)]),
  ) as T;
}
