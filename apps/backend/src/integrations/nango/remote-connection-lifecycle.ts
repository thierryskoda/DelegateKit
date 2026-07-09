import type { DeleteRemoteOAuthConnection } from "../../product/connected-accounts/connected-account-lifecycle";
import { throwNangoDomainError } from "./nango-admin-client-error";
import { createNangoAdminClient } from "./nango-client";

export const deleteNangoRemoteConnection: DeleteRemoteOAuthConnection = async (input) => {
  try {
    await createNangoAdminClient().deleteConnection(input.providerConfigKey, input.connectionId);
  } catch (err: unknown) {
    throwNangoDomainError(err, {
      operation: "nango.connection.delete",
      publicSummary: "Nango deleteConnection failed during account link cleanup",
      providerConfigKey: input.providerConfigKey,
      evidence: {
        profile_id: input.profileId,
        capability_account_link_id: input.capabilityAccountLinkId,
      },
    });
  }
};
