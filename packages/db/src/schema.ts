/** Application DTOs. SQL schema, constraints and RLS live in supabase/migrations. */
export interface User {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  avatarData: Uint8Array | null;
  avatarUpdatedAt: Date | null;
  createdAt: Date;
}
export interface Tenant {
  id: string;
  name: string;
  nameKey: string;
  createdAt: Date;
}
export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: "admin" | "member";
  status: "active" | "pending" | "rejected";
  permissions: string[] | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}
export interface Document {
  id: string;
  tenantId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sha256: string | null;
  sizeBytes: number;
  chunkCount: number;
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  sourceText: string | null;
  objectKey: string | null;
  objectUrl: string | null;
  fileData: Uint8Array | null;
  createdAt: Date;
  deletedAt: Date | null;
}
export interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  pinned: boolean;
  createdAt: Date;
}
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: unknown;
  createdAt: Date;
}
export interface ModelSetting {
  id: string;
  tenantId: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  updatedAt: Date;
}
