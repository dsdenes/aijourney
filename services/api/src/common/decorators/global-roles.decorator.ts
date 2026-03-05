import type { GlobalRole } from '@aijourney/shared';
import { SetMetadata } from '@nestjs/common';

export const GLOBAL_ROLES_KEY = 'globalRoles';
export const GlobalRoles = (...roles: GlobalRole[]) => SetMetadata(GLOBAL_ROLES_KEY, roles);
