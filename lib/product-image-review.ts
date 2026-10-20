/**
 * Product-image review rules (pure — shared by the admin API, the pipeline CLI and tests).
 *
 * A candidate image becomes `approved` only when an authenticated admin confirms BOTH:
 *   1. the image shows the exact product model (a human confirmation — AI ranking is advisory only), and
 *   2. commercial-use authorization, backed by recorded evidence.
 * Approval never touches the product's publication status: only the `images` field is ever written,
 * and only by the separate upload/apply stage.
 */

export const REVIEW_STATES = [
  "discovered", // found by a source; not yet checked
  "needs_manual_verification", // technically valid, but model identity or authorization unresolved
  "needs_manual_source", // no authorized exact-model image could be found
  "pending_review", // ready for an admin decision
  "approved", // exact model + authorization confirmed by an admin
  "rejected",
  "uploaded", // stored in Supabase and linked to the product
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const AUTHORIZATION_TYPES = ["written_permission", "documented_licence", "client_supplied", "own_photography"] as const;
export type AuthorizationType = (typeof AUTHORIZATION_TYPES)[number];

export interface AuthorizationEvidence {
  type: AuthorizationType;
  /** Who granted it (brand, distributor, licence name, client name). */
  grantedBy: string;
  /** Where the evidence is kept: email reference, document path, licence URL. */
  reference: string;
  /** Licences only: the admin attests the licence's conditions are met on the live site. */
  conditionsMet?: boolean;
  note?: string;
}

export interface CandidateImage {
  url?: string; // remote original (never shown with secrets)
  storageUrl?: string; // already-uploaded client image
  sourcePage?: string;
  sourceType?: string;
  width?: number;
  height?: number;
  format?: string;
  sha256?: string;
  technicallyValid?: boolean;
  technicalIssue?: string | null;
  modelEvidence?: string | null; // e.g. "exact model in source SKU"
  aiAssessment?: { provider: string; score?: number | null; summary?: string; issues?: string[]; error?: string } | null;
  permissionStatus?: string | null; // from the pipeline's permission register
  permissionReason?: string | null;
  licenceEvidence?: { url?: string; document?: string; quote?: string; finding?: string }[];
  title?: string;
  searchQuery?: string;
  discoveredAt?: string;
  cacheFile?: string | null; // pipeline-local cached original (never served)
  checks?: string[]; // verification notes shown to the reviewer
  /** Catalogue-PDF provenance (pipeline `catalogue` command); previews are pipeline-local files. */
  catalogue?: {
    pdf: string; page: number; cropBox: number[]; cropSource: string; evidenceText: string; matchLevel: string;
    identity: string; quality: string; issues: string[]; rowModels: string[]; preview: string; highlight: string; nativeLongestPx?: number;
  };
  localPreview?: string; // extracted image preview, relative to the pipeline state directory
  pagePreview?: string; // page render with the crop outlined
}

export interface ProductSnapshot {
  name: string;
  brand: string;
  model: string;
  sku?: string;
  category?: string;
  status?: string | null;
  images: string[];
}

export interface ReviewRecord {
  _id?: unknown;
  /** Stable id: `<productId>:<sha256 of the source image URL or bytes>`, or `<productId>:source` for "no candidate". */
  reviewId: string;
  productId: string;
  product?: ProductSnapshot;
  rank?: number;
  createdAt?: string;
  updatedAt?: string;
  moreCandidatesRequestedAt?: string | null;
  rolledBackAt?: string | null;
  importRun?: string; // pipeline import that inserted the record (for review-rollback)
  state: ReviewState;
  candidate: CandidateImage;
  version: number;
  exactModelConfirmed?: boolean;
  authorization?: AuthorizationEvidence | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  uploadedUrl?: string | null;
  history: { at: string; by: string; from: ReviewState; to: ReviewState; note?: string }[];
}

export type ReviewAction =
  | { type: "approve"; exactModelConfirmed: boolean; authorization: AuthorizationEvidence }
  | { type: "reject"; reason: string }
  | { type: "needs_manual_verification"; note?: string }
  | { type: "needs_manual_source"; note?: string }
  | { type: "mark_uploaded"; uploadedUrl: string };

const ALLOWED: Record<ReviewState, ReviewState[]> = {
  discovered: ["pending_review", "needs_manual_verification", "needs_manual_source", "rejected"],
  needs_manual_verification: ["pending_review", "approved", "rejected", "needs_manual_source"],
  needs_manual_source: ["pending_review", "rejected"],
  pending_review: ["approved", "rejected", "needs_manual_verification", "needs_manual_source"],
  approved: ["uploaded", "rejected"], // an approval can be withdrawn before upload
  rejected: ["pending_review"],
  uploaded: [], // final; undo goes through rollback, which restores the product and records it separately
};

export function canTransition(from: ReviewState, to: ReviewState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/** Returns the first reason an approval is not allowed, or null. AI scores are deliberately not consulted. */
export function approvalProblem(review: Pick<ReviewRecord, "state" | "candidate">, action: Extract<ReviewAction, { type: "approve" }>): string | null {
  if (!canTransition(review.state, "approved")) return `cannot approve from state "${review.state}"`;
  if (action.exactModelConfirmed !== true) return "the exact product model must be confirmed by the reviewer";
  if (review.candidate.technicallyValid === false) return `the image failed technical validation${review.candidate.technicalIssue ? `: ${review.candidate.technicalIssue}` : ""}`;
  if (!review.candidate.url && !review.candidate.storageUrl && !review.candidate.localPreview) return "the candidate has no image";
  const cat = review.candidate.catalogue;
  if (cat && cat.identity !== "EXACT_UNAMBIGUOUS") return `catalogue photo does not identify one model (${cat.identity.toLowerCase().replace(/_/g, " ")})`;
  const a = action.authorization;
  if (!a || !AUTHORIZATION_TYPES.includes(a.type)) return "commercial-use authorization is required";
  if (!a.grantedBy?.trim() || a.grantedBy.trim().length < 2) return "authorization must name who granted it";
  if (!a.reference?.trim() || a.reference.trim().length < 4) return "authorization must reference its evidence (email, document or licence URL)";
  if (a.type === "documented_licence" && a.conditionsMet !== true) return "the licence's conditions must be met on the live site before its images can be used";
  if (review.candidate.permissionStatus === "permission_denied" && a.type !== "written_permission")
    return "the source's terms prohibit reuse; only a written permission from the rights holder can override that";
  return null;
}

/** Applies an action, returning the new record (pure) or an error message. */
export function applyReviewAction(review: ReviewRecord, action: ReviewAction, by: string, now = new Date().toISOString()): { record: ReviewRecord } | { error: string } {
  const to: ReviewState =
    action.type === "approve" ? "approved" : action.type === "reject" ? "rejected" : action.type === "mark_uploaded" ? "uploaded" : action.type;
  if (action.type === "approve") {
    const problem = approvalProblem(review, action);
    if (problem) return { error: problem };
  } else if (!canTransition(review.state, to)) {
    return { error: `cannot move from "${review.state}" to "${to}"` };
  }
  if (action.type === "reject" && !action.reason?.trim()) return { error: "a rejection reason is required" };
  // Same rule as the storage config: https, or plain http only for a local test server.
  if (action.type === "mark_uploaded" && !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(action.uploadedUrl)) return { error: "uploaded URL must be https" };
  const record: ReviewRecord = {
    ...review,
    state: to,
    version: review.version + 1,
    updatedAt: now,
    history: [...review.history, { at: now, by, from: review.state, to, note: action.type === "reject" ? action.reason : "note" in action ? action.note : undefined }],
  };
  if (action.type === "approve") Object.assign(record, { exactModelConfirmed: true, authorization: action.authorization, decidedBy: by, decidedAt: now, rejectionReason: null });
  if (action.type === "reject") Object.assign(record, { decidedBy: by, decidedAt: now, rejectionReason: action.reason.trim() });
  if (action.type === "mark_uploaded") record.uploadedUrl = action.uploadedUrl;
  return { record };
}

/** Initial state for a newly discovered candidate — never "approved". */
export function initialState(c: CandidateImage): ReviewState {
  if (c.technicallyValid === false) return "rejected";
  if (c.permissionStatus === "permission_denied") return "needs_manual_verification";
  if (c.modelEvidence && c.technicallyValid) return "pending_review";
  return "needs_manual_verification";
}
