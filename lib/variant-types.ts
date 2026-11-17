import type { JobEvent, JobStatus, Platform, ResearchSource } from './types';
export interface StoryVariant {
  id: string;
  /** Output directory ID, as required by the publishing contract. */
  jobId: string;
  sourceJobId: string;
  platform: Platform;
  filename: string;
  duration: number;
  targetDuration: number;
  durationLimit: number;
  sha256: string;
  adaptedNarrative: boolean;
  qaPassed: boolean;
  editorialApproved: boolean;
  rightsApproved: boolean;
  status: JobStatus;
  title: string;
  script?: string;
  claims?: { text: string; sourceUrls: string[] }[];
  sources: ResearchSource[];
  artifacts: Record<string, string>;
  blocker?: string;
  events: JobEvent[];
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  idempotencyKey: string;
}
