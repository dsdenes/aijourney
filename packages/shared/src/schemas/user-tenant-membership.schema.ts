import { z } from 'zod';
import { ORG_ROLES } from '../constants/roles.js';

export const assignUserToTenantSchema = z.object({
  tenantId: z.string().min(1),
  orgRole: z.enum(ORG_ROLES),
  makeActive: z.boolean().optional(),
});

export const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

export type AssignUserToTenantInput = z.infer<typeof assignUserToTenantSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;
