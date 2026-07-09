import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const publicUrlSchema = z
  .string()
  .trim()
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

export const connectPublicConfigPath = "/connect-config.json";
export const connectPublicConfigSchema = z
  .object({
    backendUrl: publicUrlSchema,
    supabaseUrl: publicUrlSchema,
    supabaseAnonKey: nonEmptyStringSchema,
  })
  .strict();

export type ConnectPublicConfig = z.infer<typeof connectPublicConfigSchema>;
