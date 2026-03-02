export interface UserEvent {
	userId: string;
	timestamp: string;
	eventId: string;
	event: string;
	properties: Record<string, unknown>;
	sessionId: string;
}
