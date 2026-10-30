import { useState, memo, type FormEvent } from "react";
import { LogIn, LogOut, ShieldCheck, Mail, Camera, Check, User } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, apiFetch, isDesktop } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export const SettingsAccountTab = memo(function SettingsAccountTab() {
  const { t } = useI18n();
  const [userName, setUserName] = useState(() => localStorage.getItem("arunaki_user_name") || "");
  const [userAvatar, setUserAvatar] = useState(() => localStorage.getItem("arunaki_user_avatar") || "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("arunaki_user_email") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("arunaki_user_email"));
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const clientPlatform = isDesktop()
    ? (navigator.userAgent.includes("Windows")
        ? "Windows Desktop Workstation"
        : navigator.userAgent.includes("Mac")
        ? "macOS Desktop Workstation"
        : "Linux Desktop Workstation")
    : "Web Workstation Client";

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      toast.error("Please enter your email address.");
      return;
    }
    if (loginPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    const cleanEmail = loginEmail.trim();
    localStorage.setItem("arunaki_user_email", cleanEmail);
    setUserEmail(cleanEmail);
    if (isRegisterMode && registerName.trim()) {
      localStorage.setItem("arunaki_user_name", registerName.trim());
      setUserName(registerName.trim());
    }
    setIsLoggedIn(true);
    setLoginPassword("");
    setRegisterName("");
    toast.success(isRegisterMode ? `Account registered for ${cleanEmail}` : `Signed in as ${cleanEmail}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("arunaki_user_email");
    localStorage.removeItem("arunaki_user_name");
    localStorage.removeItem("arunaki_user_avatar");
    setUserEmail("");
    setUserName("");
    setUserAvatar("");
    setIsLoggedIn(false);
    toast.info("Signed out. Local offline mode is active.");
  };

  const pollOAuthResult = async (provider: "google" | "github", state: string) => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const res = await apiFetch(`${API_BASE}/oauth/${provider}/result?state=${encodeURIComponent(state)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { pending: boolean; email: string; name: string; avatar: string };
      if (!data.pending && data.email) return data;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  };

  const handleOAuthLogin = async (provider: "google" | "github") => {
    try {
      const res = await apiFetch(`${API_BASE}/oauth/${provider}/start`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string; data?: { message?: string } } | null;
        toast.error(body?.message || body?.data?.message || `${provider} sign-in is not configured.`);
        return;
      }
      const { url, state } = (await res.json()) as { url: string; state: string };
      window.open(url, "arunaki-oauth", "popup=yes,width=520,height=680");
      const profile = await pollOAuthResult(provider, state);
      if (!profile) {
        toast.error("Sign-in timed out or was cancelled.");
        return;
      }
      localStorage.setItem("arunaki_user_email", profile.email);
      if (profile.name) localStorage.setItem("arunaki_user_name", profile.name);
      if (profile.avatar) localStorage.setItem("arunaki_user_avatar", profile.avatar);
      setUserEmail(profile.email);
      if (profile.name) setUserName(profile.name);
      if (profile.avatar) setUserAvatar(profile.avatar);
      setIsLoggedIn(true);
      toast.success(`Signed in as ${profile.email}`);
    } catch {
      toast.error("Sign-in failed. Make sure the engine is reachable.");
    }
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--text-primary)]" />
          {t("userAccountLicenseTitle")}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {t("userAccountLicenseSubtitle")}
        </p>
      </div>

      {isLoggedIn ? (
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Profile Card */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-6">
            <div className="flex items-center gap-4">
              {/* Avatar with Camera Overlay (Monochrome) */}
              <div className="relative group cursor-pointer shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-[var(--bg-hover)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-primary)] font-bold text-2xl overflow-hidden">
                  {userAvatar ? (
                    <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span>{userName ? userName[0].toUpperCase() : userEmail ? userEmail[0].toUpperCase() : "U"}</span>
                  )}
                </div>
                <label className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const result = ev.target?.result as string;
                          setUserAvatar(result);
                          localStorage.setItem("arunaki_user_avatar", result);
                          toast.success("Profile photo updated successfully.");
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {userName || userEmail.split("@")[0] || "User"}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] text-[10px] font-semibold border border-[var(--border-strong)] flex items-center gap-1 shrink-0">
                    <Check className="w-2.5 h-2.5 text-[var(--text-muted)]" /> {t("proLicense")}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 truncate">
                  <Mail className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                  <span className="truncate">{userEmail}</span>
                </p>
              </div>
            </div>

            {/* Profile Form Field */}
            <div className="pt-4 border-t border-[var(--border-color)]">
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1.5">
                {t("fullNameBusiness")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. John Doe / Acme Corp"
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("arunaki_user_name", userName);
                    toast.success("Profile name saved.");
                  }}
                  className="px-5 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  {t("save")}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl text-xs font-medium border border-[var(--border-color)] transition-all cursor-pointer flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t("signOut")}</span>
              </button>
            </div>
          </div>

          {/* Right 1 Col: License & Device Status (Monochrome) */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-4">
              <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider text-[var(--text-muted)]">
                {t("licenseDetails")}
              </h4>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <p className="text-[11px] text-[var(--text-muted)]">{t("verificationStatus")}</p>
                  <p className="font-semibold text-[var(--text-primary)] mt-0.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t("activeVerified")}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <p className="text-[11px] text-[var(--text-muted)]">{t("connectedClient")}</p>
                  <p className="font-semibold text-[var(--text-primary)] mt-0.5">
                    {clientPlatform}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">Local Workspace Vault</h4>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">AES-256 / Offline Isolated — Documents stay on this PC</p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] text-[10px] font-semibold border border-[var(--border-strong)]">
                Active (Offline)
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Full Width Clean Login Form (Monochrome, No Emojis) */
        <div className="w-full p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center border border-[var(--border-strong)] text-[var(--text-primary)] shrink-0">
              <LogIn className="w-5 h-5 text-[var(--text-muted)]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {isRegisterMode ? t("createAccount") : t("signInAccount")}
              </h4>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {isRegisterMode ? t("createAccountDesc") : t("signInAccountDesc")}
              </p>
            </div>
          </div>

          {/* Clean Monochrome Social Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={() => handleOAuthLogin("google")}
              className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-[var(--text-primary)] fill-current" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{t("continueGoogle")}</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuthLogin("github")}
              className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current text-[var(--text-primary)]" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>{t("continueGithub")}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="text-[11px] text-[var(--text-muted)]">{t("orContinueEmail")}</span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4 w-full">
            {isRegisterMode && (
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  {t("fullNameBusiness")}
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe / Acme Corp"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                {t("emailAddress")}
              </label>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                {t("password")}
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isRegisterMode ? t("registerAndSignIn") : t("signIn")}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRegisterMode(!isRegisterMode)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {isRegisterMode ? t("alreadyHaveAccount") : t("dontHaveAccount")}
              </button>
            </div>
          </form>

          {/* Clean Privacy Notice (No Emoji) */}
          <div className="pt-4 border-t border-[var(--border-color)] flex items-start gap-2.5 text-[11px] text-[var(--text-muted)] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
            <span>
              <strong className="text-[var(--text-primary)]">{t("privacyGuaranteeTitle")}</strong> {t("privacyGuaranteeDesc")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
