import { ModelMeta } from "./types";

/**
 * Model ids are self-describing, so the dropdown derives what it can from the id instead of
 * carrying a lookup table. The table below is only for editorial copy that cannot be inferred.
 */
export const MODEL_METADATA: Record<string, ModelMeta> = {
  "opencode/big-pickle": { label: "Big Pickle", badge: "Zen Built-in", speed: "Reasoning" },
  "groq/openai/gpt-oss-120b": { label: "GPT-OSS 120B", badge: "Groq LPU", speed: "Ultra Fast" },
  "9router/ComboMaut": { label: "ComboMaut", badge: "Smart Combo", speed: "Auto Fallback" },
  "o3-mini": { label: "o3-mini", badge: "Reasoning", speed: "Fast" },
  "o1": { label: "o1", badge: "High Intelligence" },
  "claude-3-7-sonnet": { label: "Claude 3.7 Sonnet", badge: "Hybrid Reasoning", speed: "Fast" },
  "claude-3-5-sonnet": { label: "Claude 3.5 Sonnet", badge: "Capable", speed: "Fast" },
  "claude-3-5-haiku": { label: "Claude 3.5 Haiku", badge: "Compact", speed: "Fast" },
  "deepseek-r1": { label: "DeepSeek R1", badge: "Reasoning", speed: "Smart" },
  "kiro/auto": { label: "Auto (Best Available)", badge: "Kiro AI", speed: "Smart Route" },
  "kiro/claude-opus-4.6": { label: "Claude Opus 4.6", badge: "Kiro Pro", speed: "Deep Think" },
  "kiro/claude-sonnet-4.6": { label: "Claude Sonnet 4.6", badge: "Kiro Pro", speed: "Fast" },
  "kiro/claude-sonnet-4.5": { label: "Claude Sonnet 4.5", badge: "Kiro Pro", speed: "Fast" },
  "kiro/claude-haiku-4.5": { label: "Claude Haiku 4.5", badge: "Kiro Fast", speed: "Instant" },
  "kiro/deepseek-3.2": { label: "DeepSeek 3.2", badge: "Kiro", speed: "Reasoning" },
  "kiro/minimax-m2.5": { label: "MiniMax M2.5", badge: "Kiro", speed: "Balanced" },
  "kiro/glm-5": { label: "GLM-5", badge: "Kiro", speed: "Balanced" },
  "kiro/qwen3-coder-next": { label: "Qwen3 Coder Next", badge: "Kiro Coder", speed: "Code Specialist" },
};

export const ACRONYMS: Record<string, string> = {
  gpt: "GPT",
  oss: "OSS",
  llm: "LLM",
  ai: "AI",
  tts: "TTS",
};

export const VENDOR_BADGES: [RegExp, string][] = [
  [/^groq\//, "Groq LPU"],
  [/^(9router|oc|kr|vx|cx)\//, "9Router"],
  [/^opencode\//, "Zen Built-in"],
  [/^kiro\//, "Kiro"],
];

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Turn a raw model id into something readable, falling back to the id when it cannot. */
export function describeModel(id: string | undefined): ModelMeta {
  if (!id) return { label: "No models available" };
  const override = MODEL_METADATA[id];
  if (override) return override;

  // Drop provider prefix and internal effort tier
  const leaf = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const bare = leaf.replace(/-(?:extra-low|low|medium|high|tiered|agent)$/i, "");

  const parts = bare.split(/[-_]+/).filter(Boolean);
  const words: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const sized = lower.match(/^(\d+)([bk])$/);
    const word =
      ACRONYMS[lower] ?? (sized ? `${sized[1]}${sized[2].toUpperCase()}` : capitalize(part));
    const prev = words[words.length - 1];
    if (prev && /\d$/.test(prev) && /^\d+$/.test(part)) words[words.length - 1] = `${prev}.${part}`;
    else words.push(word);
  }

  const vendor = VENDOR_BADGES.find(([re]) => re.test(id));
  const tier = leaf.match(/-(extra-low|low|medium|high|tiered|agent)$/i)?.[1];
  return {
    label: words.join(" ") || id,
    badge: tier ? tier.split("-").map(capitalize).join(" ") : vendor?.[1],
  };
}
