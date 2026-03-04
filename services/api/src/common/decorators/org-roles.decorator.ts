import type { OrgRole } from "@aijourney/shared";
import { SetMetadata } from "@nestjs/common";

export const ORG_ROLES_KEY = "orgRoles";
export const OrgRoles = (...roles: OrgRole[]) =>
	SetMetadata(ORG_ROLES_KEY, roles);
