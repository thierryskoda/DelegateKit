import {
  profilesResponseSchema,
  type ConnectProfileDto,
} from "@ai-assistants/connect-api-contracts";
import { backendFetch } from "../../shared/api/backend-api";

export type ProfileRow = ConnectProfileDto;

export async function listProfiles(): Promise<ProfileRow[]> {
  const payload = await backendFetch("/profiles", profilesResponseSchema);
  return payload.profiles;
}
