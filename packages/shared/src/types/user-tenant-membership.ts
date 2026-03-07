import type { OrgRole } from '../constants/roles.js';

export interface UserTenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  orgRole: OrgRole;
  createdAt: string;
  updatedAt: string;
}
