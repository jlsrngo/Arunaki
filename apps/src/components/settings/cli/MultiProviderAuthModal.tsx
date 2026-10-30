import { X, Terminal, Scale, Loader2 } from "lucide-react";
import { LocalCliData } from "./types";

interface MultiProviderAuthModalProps {
  target: string | null;
  data: LocalCliData;
  isEn: boolean;
  isSigningInCli: boolean;
  onClose: () => void;
  onLaunchClaudeTerminal: () => void;
  onLaunchCodexTerminal: () => void;
  onLaunchOpenCodeTerminal: () => void;
  onLaunch9Router: () => void;
  onAntigravityCliLogin: () => void;
}

export function MultiProviderAuthModal({
  target,
  data,
  isEn,
  isSigningInCli,
  onClose,
  onLaunchClaudeTerminal,
  onLaunchCodexTerminal,
  onLaunchOpenCodeTerminal,
  onLaunch9Router,
  onAntigravityCliLogin,
}: MultiProviderAuthModalProps) {
  if (!target) return null;

  const config = (() => {
    switch (target) {
      case "claude":
        return {
          title: isEn
            ? "Anthropic Claude Authentication"
            : "Autentikasi Anthropic Claude",
          subtitle: isEn
            ? "Choose an authentication method to connect your Claude Pro / Team account."
            : "Pilih metode autentikasi akun Claude Pro / Team ke workstation Arunaki.",
          badgeLetter: "C",
          accountActiveText: data.claude?.email
            ? isEn
              ? `Active account: ${data.claude.email}`
              : `Akun aktif: ${data.claude.email}`
            : undefined,
          isLoggedIn: Boolean(data.claude?.loggedIn),
          cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
          cliBadge: "Claude Code",
          cliDesc: isEn
            ? "Runs 'claude auth login --claudeai' in terminal for local machine authentication."
            : "Menjalankan perintah 'claude auth login --claudeai' di terminal untuk otentikasi lokal.",
          cliTradeoffTitle: isEn
            ? "CLI Considerations:"
            : "Pertimbangan (Terminal CLI):",
          cliTradeoffText: isEn
            ? "Opens a console terminal window for initial login. Tokens are stored locally on PC (~/.claude.json) with zero per-token cost."
            : "Membuka jendela konsol terminal untuk inisialisasi login awal. Token disimpan lokal di PC (~/.claude.json) dan bebas biaya per-token.",
          cliButton: isEn ? "Launch Claude Terminal" : "Buka Terminal Claude",
          onCliAction: () => {
            onLaunchClaudeTerminal();
            onClose();
          },
        };
      case "codex":
        return {
          title: isEn
            ? "OpenAI Codex Authentication"
            : "Autentikasi OpenAI Codex",
          subtitle: isEn
            ? "Choose an authentication method for your OpenAI / ChatGPT Plus account."
            : "Pilih metode autentikasi akun OpenAI / ChatGPT Plus ke workstation Arunaki.",
          badgeLetter: "O",
          accountActiveText: undefined,
          isLoggedIn: Boolean(data.codex?.installed),
          cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
          cliBadge: "@openai/codex",
          cliDesc: isEn
            ? "Uses global '@openai/codex' CLI package via local console on your PC."
            : "Menggunakan paket CLI global '@openai/codex' melalui konsol lokal di PC Anda.",
          cliTradeoffTitle: isEn
            ? "CLI Considerations:"
            : "Pertimbangan (Terminal CLI):",
          cliTradeoffText: isEn
            ? "Requires global npm '@openai/codex' installation. Runs interactive console sessions locally on your machine."
            : "Memerlukan instalasi global npm '@openai/codex'. Menjalankan interaksi konsol langsung di PC Anda.",
          cliButton: isEn ? "Launch Codex Terminal" : "Buka Terminal Codex",
          onCliAction: () => {
            onLaunchCodexTerminal();
            onClose();
          },
        };
      case "opencode":
        return {
          title: isEn
            ? "OpenCode Agent Authentication"
            : "Autentikasi OpenCode Agent",
          subtitle: isEn
            ? "Choose an authentication method to connect OpenCode models to Arunaki."
            : "Pilih metode autentikasi untuk menghubungkan model OpenCode ke Arunaki.",
          badgeLetter: "OC",
          accountActiveText: data.opencode?.authenticatedProviders?.length
            ? isEn
              ? `Connected providers: ${data.opencode.authenticatedProviders.join(", ")}`
              : `Penyedia terhubung: ${data.opencode.authenticatedProviders.join(", ")}`
            : undefined,
          isLoggedIn: Boolean(
            data.opencode?.serverRunning ||
              data.opencode?.authenticatedProviders?.length
          ),
          cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
          cliBadge: "OpenCode CLI",
          cliDesc: isEn
            ? "Runs local OpenCode daemon server on port 4097 with interactive sessions."
            : "Menjalankan server daemon OpenCode lokal di port 4097 dengan sesi interaktif.",
          cliTradeoffTitle: isEn
            ? "CLI Considerations:"
            : "Pertimbangan (Terminal CLI):",
          cliTradeoffText: isEn
            ? "Runs a local background process on port 4097. Requires an active terminal runtime on your PC."
            : "Menjalankan proses latar belakang lokal di port 4097. Membutuhkan runtime terminal aktif di PC.",
          cliButton: isEn ? "Launch OpenCode Terminal" : "Buka Terminal OpenCode",
          onCliAction: () => {
            onLaunchOpenCodeTerminal();
            onClose();
          },
        };
      case "nineRouter":
        return {
          title: isEn
            ? "9Router Gateway Integration"
            : "Integrasi 9Router Gateway",
          subtitle: isEn
            ? "Connect your local multi-account 9Router gateway to Arunaki."
            : "Hubungkan gateway multi-akun 9Router lokal ke Arunaki.",
          badgeLetter: "9R",
          accountActiveText: data.nineRouter?.running
            ? isEn
              ? "9Router gateway is running on port 20128"
              : "Gateway 9Router sedang berjalan di port 20128"
            : undefined,
          isLoggedIn: Boolean(data.nineRouter?.running),
          cliLabel: isEn ? "Run via Terminal" : "Jalankan via Terminal",
          cliBadge: "npm i -g 9router && 9router",
          cliDesc: isEn
            ? "Start local 9Router gateway proxy via console terminal window."
            : "Mulai gateway proxy lokal 9Router melalui jendela konsol terminal.",
          cliTradeoffTitle: isEn
            ? "CLI Setup & Command:"
            : "Petunjuk Instalasi & Perintah:",
          cliTradeoffText: isEn
            ? "Install globally via 'npm i -g 9router' and launch with '9router'. Exposes an OpenAI-compatible API at http://localhost:20128/v1 for unified CLI, Pro, and free models."
            : "Pasang secara global via 'npm i -g 9router' dan jalankan dengan '9router'. Menyediakan API kompatibel OpenAI di http://localhost:20128/v1 untuk semua akun CLI, Pro, dan model gratis.",
          cliButton: isEn
            ? "Start 9Router in Terminal"
            : "Mulai 9Router di Terminal",
          onCliAction: () => {
            onLaunch9Router();
            onClose();
          },
        };
      case "antigravity":
      default:
        return {
          title: isEn
            ? "Google Antigravity Authentication"
            : "Autentikasi Google Antigravity",
          subtitle: isEn
            ? "Choose an authentication method to connect Gemini models to Arunaki."
            : "Pilih metode autentikasi untuk menghubungkan model Gemini ke Arunaki.",
          badgeLetter: "A",
          accountActiveText: data.antigravity?.accountEmail
            ? `${isEn ? "Current active account: " : "Akun aktif saat ini: "}${data.antigravity.accountEmail}`
            : undefined,
          isLoggedIn: Boolean(data.antigravity?.loggedIn),
          cliLabel: isEn ? "Sign in via CLI" : "Masuk via CLI",
          cliBadge: "Terminal agy",
          cliDesc: isEn
            ? "Uses locally installed Antigravity CLI synced on your computer."
            : "Menggunakan aplikasi Antigravity CLI lokal yang sudah terpasang dan tersinkronisasi di komputer.",
          cliTradeoffTitle: isEn
            ? "CLI Considerations:"
            : "Pertimbangan (Terminal CLI):",
          cliTradeoffText: isEn
            ? "Opens a physical terminal window (wt/cmd) for initial login. Provides minimal latency (~17ms) and immediately reads active PC session."
            : "Membuka jendela konsol terminal fisik (wt/cmd) untuk inisialisasi login awal. Memberikan latensi paling minimal (~17ms) & langsung membaca sesi akun aktif PC.",
          cliButton: isEn ? "Launch Terminal CLI" : "Buka Terminal CLI",
          onCliAction: onAntigravityCliLogin,
        };
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl max-w-xl w-full p-6 relative text-left">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          title={isEn ? "Close" : "Tutup"}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-primary)] font-bold text-sm">
            {config.badgeLetter}
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{config.title}</h3>
            <p className="text-xs text-[var(--text-muted)]">{config.subtitle}</p>
          </div>
        </div>

        {config.accountActiveText && (
          <div className="my-3 px-3.5 py-2.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)]" />
              <span className="text-[var(--text-secondary)]">{config.accountActiveText}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium">
              {isEn ? "Connected" : "Terhubung"}
            </span>
          </div>
        )}

        <div className="flex flex-col justify-between p-4.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--border-strong)] bg-[var(--bg-panel)] transition-all group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-primary)]">
                  <Terminal className="w-4 h-4" />
                </div>
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  {config.cliLabel}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] font-medium">
                {config.cliBadge}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3.5 leading-relaxed">
              {config.cliDesc}
            </p>

            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] leading-relaxed mb-4">
              <div className="flex items-start gap-1.5 font-medium text-[var(--text-primary)] mb-1">
                <Scale className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--text-muted)]" />
                <span>{config.cliTradeoffTitle}</span>
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] leading-normal">
                {config.cliTradeoffText}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={config.onCliAction}
            disabled={isSigningInCli}
            className="w-full py-2 px-3 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)] border border-[var(--text-primary)] font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSigningInCli ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {isEn ? "Opening Terminal..." : "Membuka Terminal..."}
                </span>
              </>
            ) : (
              <>
                <Terminal className="w-3.5 h-3.5" />
                <span>{config.cliButton}</span>
              </>
            )}
          </button>
        </div>

        {target !== "nineRouter" && (
          <div className="mt-3.5 p-2.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)]" />
              <span className="text-[var(--text-secondary)]">
                {isEn
                  ? "Manage multi-accounts centrally like in 9Router (Google, Claude, Codex, Grok)?"
                  : "Kelola multi-akun terpusat seperti di 9Router (Google, Claude, Codex, Grok)?"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.open("http://localhost:20128", "_blank")}
              className="px-2.5 py-1 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] text-[11px] rounded-lg cursor-pointer shrink-0 font-medium"
            >
              {isEn ? "Open 9Router" : "Buka 9Router"}
            </button>
          </div>
        )}

        <div className="mt-4 pt-3.5 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>
            {isEn ? "Arunaki Workstation Integration" : "Integrasi Workstation Arunaki"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {isEn ? "Close" : "Tutup"}
          </button>
        </div>
      </div>
    </div>
  );
}
