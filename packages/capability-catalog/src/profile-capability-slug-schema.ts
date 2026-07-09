import { z } from "zod";

import {
  PROFILE_CAPABILITY_CATALOG,
  type ProfileCapabilitySlug,
} from "./profile-capability-catalog";

const profileCapabilitySlugValues = Object.keys(PROFILE_CAPABILITY_CATALOG) as [
  ProfileCapabilitySlug,
  ...ProfileCapabilitySlug[],
];

/** Zod schema for slugs declared in {@link PROFILE_CAPABILITY_CATALOG}. */
export const profileCapabilitySlugSchema = z.enum(profileCapabilitySlugValues);
