import type {FactoryArtifact,FactoryChangedFile,FactoryTaskRevision} from './factory';
import type {FactoryProvider,FactoryProviderConsent} from './factory-provider';
import type {VerificationCommandDTO,VerificationReceipt} from './factory-verification';

/** Inputs are untrusted. Native service parses exact keys, limits and current revisions before I/O. */
export interface FactoryTaskInput {
  id:string;
  title:string;
  description:string;
  acceptanceCriteria:string[];
  dependencies:string[];
  pathScope:string[];
  testCommandIds:string[];
}
export interface FactoryDraftInput {
  title:string;
  requirements:string;
  architecture:string;
  diagram:string;
  tasks:FactoryTaskInput[];
  commands:VerificationCommandDTO[];
}
export interface FactoryApprovalInput {
  draftRevision:number;
  provider:FactoryProvider;
  consents:FactoryProviderConsent[];
  maxTaskAttempts:number;
  maxRunMs:number;
}
export interface FactoryGenerateInput {
  stage:'requirements'|'architecture'|'plan';
  instruction:string;
  provider:FactoryProvider;
  consents:FactoryProviderConsent[];
}
export interface FactoryReviewInput {
  revisionId:string;
  decision:'accepted'|'changesrequested';
  comment:string;
}
export interface FactoryProviderStatus {
  provider:FactoryProvider;
  available:boolean;
  version:string|null;
  supported:boolean;
  reason:string;
}
export type FactoryTaskStatus='pending'|'implementing'|'verifying'|'repairing'|'readyforreview'|'blocked'|'failed'|'stopped'|'interrupted';
export interface FactoryTaskProgress {
  id:string;
  title:string;
  status:FactoryTaskStatus;
  attempts:number;
  message:string;
}
export interface FactoryReviewSummary {
  id:string;
  taskId:string;
  title:string;
  createdAt:string;
  files:number;
  checksPassed:boolean;
  decision:'unreviewed'|'accepted'|'changesrequested';
  previousRevisionId:string|null;
}
export interface FactoryWorkspaceView {
  workspaceId:string;
  repositoryRoot:string;
  draft:FactoryDraftInput;
  draftRevision:number;
  approvedRevision:number|null;
  approval:FactoryApprovalInput|null;
  runState:'idle'|'running'|'stopping'|'completed'|'blocked'|'failed'|'stopped'|'interrupted';
  activeTaskId:string|null;
  message:string;
  tasks:FactoryTaskProgress[];
  reviews:FactoryReviewSummary[];
  artifacts:FactoryArtifact[];
  providers:FactoryProviderStatus[];
}
export interface FactoryReviewView {
  summary:FactoryReviewSummary;
  revision:FactoryTaskRevision;
  changes:FactoryChangedFile[];
  receipts:VerificationReceipt[];
  artifacts:FactoryArtifact[];
}
export interface FactoryArtifactView {record:FactoryArtifact;content:string}
/** Main owns repository/storage/executable paths and actual receipt creation. */
export interface FactoryApi {
  load():Promise<FactoryWorkspaceView>;
  saveDraft(input:FactoryDraftInput):Promise<FactoryWorkspaceView>;
  generate(input:FactoryGenerateInput):Promise<FactoryWorkspaceView>;
  approve(input:FactoryApprovalInput):Promise<FactoryWorkspaceView>;
  start():Promise<FactoryWorkspaceView>;
  stop():Promise<FactoryWorkspaceView>;
  review(input:FactoryReviewInput):Promise<FactoryWorkspaceView>;
  rework(revisionId:string):Promise<FactoryWorkspaceView>;
  readRevision(revisionId:string):Promise<FactoryReviewView>;
  readArtifact(artifactId:string):Promise<FactoryArtifactView>;
}
