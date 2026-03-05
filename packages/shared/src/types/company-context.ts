export const COMPANY_FACT_CATEGORIES = [
	"products",
	"industry",
	"culture",
	"strategy",
	"processes",
	"terminology",
	"other",
] as const;
export type CompanyFactCategory = (typeof COMPANY_FACT_CATEGORIES)[number];

export interface CompanyFact {
	/** Unique ID within the document */
	id: string;
	/** Category of the extracted fact */
	category: CompanyFactCategory;
	/** The extracted fact (max ~50 words) */
	fact: string;
}

export const COMPANY_DOC_EXTRACTION_STATUSES = [
	"pending",
	"processing",
	"completed",
	"failed",
] as const;
export type CompanyDocExtractionStatus =
	(typeof COMPANY_DOC_EXTRACTION_STATUSES)[number];

export interface CompanyDocument {
	id: string;
	tenantId: string;
	/** Original filename as uploaded */
	originalName: string;
	/** MIME type */
	mimeType: string;
	/** File size in bytes */
	sizeBytes: number;
	/** Scaleway Object Storage key (path within the bucket) */
	storageKey: string;
	/** Extraction status */
	extractionStatus: CompanyDocExtractionStatus;
	/** Extracted structured facts (populated after extraction) */
	extractedFacts: CompanyFact[];
	/** Error message if extraction failed */
	extractionError?: string;
	/** Timestamp of last extraction attempt */
	lastExtractedAt?: string;
	createdAt: string;
	updatedAt: string;
}

/** API response for the combined company context (used for injection) */
export interface ResolvedCompanyContext {
	/** Admin-authored free-text */
	freeText: string;
	/** All extracted facts from all documents (deduplicated) */
	facts: CompanyFact[];
}

/** Admin API response for the company context page */
export interface CompanyContextState {
	freeText: string;
	documents: CompanyDocument[];
}
