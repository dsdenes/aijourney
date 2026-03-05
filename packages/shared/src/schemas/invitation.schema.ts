import { z } from 'zod';
import { ORG_ROLES } from '../types/invitation.js';

export const createInvitationSchema = z.object({
  email: z.string().email(),
  orgRole: z.enum(ORG_ROLES).default('member'),
});

export const bulkInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  orgRole: z.enum(ORG_ROLES).default('member'),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
