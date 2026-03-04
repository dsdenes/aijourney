export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const INVITATION_STATUSES = [
	"pending",
	"accepted",
	"expired",
	"revoked",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface Invitation {
	id: string;
	tenantId: string;
	email: string;
	orgRole: OrgRole;
	invitedBy: string;
	status: InvitationStatus;
	token: string;
	expiresAt: string;
	acceptedAt?: string;
	createdAt: string;
}
