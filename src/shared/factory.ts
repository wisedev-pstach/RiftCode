/** Version-one factory wire records. Native services resolve IDs; renderer paths are never storage authority. */
export type FactoryRunState='pending'|'implementing'|'verifying'|'repairing'|'readyforreview'|'blocked'|'failed'|'stopped'|'interrupted';
export interface FactoryScope {workspaceId:string;canonicalRoot:string}
export interface FactoryTask {id:string;title:string;dependencies:string[];testCommandIds:string[];pathScope:string[]}
export interface FactoryManifest {version:1;id:string;scope:FactoryScope;title:string;requirements:string[];tasks:FactoryTask[];state:FactoryRunState;revisionIds:string[];artifactIds:string[];createdAt:string}
export interface FactoryArtifact {version:1;id:string;scope:FactoryScope;kind:'markdown'|'mermaid'|'patch'|'source'|'receipt';fileName:string;sha256:string;bytes:number;createdAt:string}
export interface FactorySnapshotFile {path:string;mode:number;sha256:string;bytes:number;objectId:string;binary:boolean}
export interface FactorySnapshot {version:1;id:string;scope:FactoryScope;fingerprint:string;files:FactorySnapshotFile[];createdAt:string}
export interface FactoryChangedFile {path:string;status:'added'|'deleted'|'modified';binary:boolean;beforeMode:number|null;afterMode:number|null;patchArtifactId:string;beforeSourceId:string|null;afterSourceId:string|null}
export interface FactoryTaskRevision {version:1;id:string;scope:FactoryScope;taskId:string;previousRevisionId:string|null;beforeSnapshotId:string;afterSnapshotId:string;sourceFingerprint:string;changes:FactoryChangedFile[];artifactIds:string[];receiptIds:string[];createdAt:string}
export interface FactoryReviewDecision {version:1;id:string;scope:FactoryScope;revisionId:string;decision:'accepted'|'changesrequested';comment:string;createdAt:string}
