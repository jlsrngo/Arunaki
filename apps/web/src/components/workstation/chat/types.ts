import { StepItem } from "../LiveExecutionBadge";

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionInfo {
  header?: string;
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionData {
  id: string; // requestID
  sessionID: string;
  questions: QuestionInfo[];
  selectedAnswer?: string | string[];
  answered?: boolean;
}

export type MessagePart =
  | { type: "thought"; text: string; durationSec?: number; durationMs?: number }
  | { type: "text"; text: string }
  | { type: "tool"; step: StepItem }
  | { type: "question"; data: QuestionData };

export interface MessageFileAttachment {
  name?: string;
  uri: string;
  mime?: string;
  description?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  executionSteps?: StepItem[];
  thoughtSec?: number;
  thoughtMs?: number;
  metadata?: string | Record<string, any>;
  reasoning?: string;
  parts?: MessagePart[];
  question?: QuestionData;
  files?: MessageFileAttachment[];
  summary?: boolean;
}

export interface AttachedImage {
  id: string;
  name: string;
  url: string;
  dataUrl: string;
  mime: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
}
