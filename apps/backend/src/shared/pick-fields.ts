export type TrueFieldMask<T extends object> = Partial<Record<keyof T, true>>;

export function pickFields<T extends object, const M extends TrueFieldMask<T>>(
  value: T,
  fields: M,
): Pick<T, Extract<keyof M, keyof T>> {
  const out = {} as Pick<T, Extract<keyof M, keyof T>>;
  for (const key of Object.keys(fields) as Array<Extract<keyof M, keyof T>>) {
    out[key] = value[key];
  }
  return out;
}
