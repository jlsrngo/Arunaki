import type { Provider } from "../ModelProviderSettings";

export type CliProviderId = string;

export interface ClaudeCliStatus {
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  error?: string;
}

export interface OpenCodeStatus {
  installed: boolean;
  version?: string;
  serverRunning?: boolean;
  serverPort?: number;
  authenticatedProviders: string[];
  hasGroq: boolean;
  has9Router: boolean;
  error?: string;
}

export interface CliProviderDescriptor {
  id: string;
  name: string;
  vendor: string;
  docsUrl?: string;
  installUrl?: string;
  installSizeMb?: number;
  loginCommand?: string;
  credentialPath?: string;
  credentialTarget?: string;
  quota: "antigravity" | "claude" | "codex" | "kiro" | "none";
  models: string[];
  requiresCli: boolean;
  loginMode: "terminal" | "browser" | "none";
  supportsAutoConfigure: boolean;
  supportsBrowserLogin: boolean;
  /** Subscription the vendor requires before it issues a token. */
  entitlement?: { notice: string; noticeId: string; url: string };
  note?: { text: string; textId: string };
}

export interface AntigravityStatus {
  detected: boolean;
  cliInstalled?: boolean;
  agyInstalled?: boolean;
  agySignedIn?: boolean;
  agyVersion?: string;
  geminiCliInstalled?: boolean;
  geminiVersion?: string;
  path?: string;
  environment: string;
  loggedIn?: boolean;
  accountEmail?: string;
}

export interface NineRouterStatus {
  installed?: boolean;
  version?: string;
  running: boolean;
  url: string;
  models: string[];
}

export interface CodexStatus {
  installed: boolean;
  version?: string;
  isCloudOnly: boolean;
  message?: string;
  signedIn: boolean;
  plan: string | null;
  accountEmail: string | null;
  expiresAt: number | null;
}

export interface DiscoveredCliItem {
  provider: string;
  displayName: string;
  type: string;
  sourcePath: string;
  accountEmail?: string;
  accountId?: string;
  expiresAt?: number;
  lastRefreshAt?: number;
  hasToken: boolean;
}

export interface KiroStatus {
  installed: boolean;
  signedIn: boolean;
  requiresCli: boolean;
  accountEmail: string | null;
  region: string;
  hasRefreshToken: boolean;
  expiresAt: number | null;
}

export interface LocalCliData {
  claude: ClaudeCliStatus;
  opencode: OpenCodeStatus;
  antigravity: AntigravityStatus;
  nineRouter: NineRouterStatus;
  codex?: CodexStatus;
  kiro?: KiroStatus;
  bridgePort: number;
  bridgeRunning: boolean;
  discovered?: DiscoveredCliItem[];
  /** Provider catalog from the engine registry. */
  registry?: CliProviderDescriptor[];
  sources?: Record<string, any>;
}

export interface QuotaBucket {
  id: string;
  label: string;
  window: string;
  /** 0..1 fraction remaining */
  remaining: number;
  exhausted?: boolean;
  /** Epoch millis, or undefined when the vendor did not report a reset time. */
  resetAt?: number;
}

export interface QuotaReport {
  provider: string;
  ok: boolean;
  reason?: string;
  buckets: QuotaBucket[];
}

export interface ModelMeta {
  label: string;
  badge?: string;
  speed?: string;
}

export interface SettingsCliConnectionsTabProps {
  providers: Provider[];
  onRefresh: () => void;
}
