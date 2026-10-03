export const PROVIDER_TYPES = [
  { value: "groq", label: "Groq Cloud (Ultra-Fast LPU)", defaultUrl: "https://api.groq.com/openai/v1" },
  { value: "gemini", label: "Google Gemini (Official / Vertex)", defaultUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "deepseek", label: "DeepSeek Official", defaultUrl: "https://api.deepseek.com/v1" },
  { value: "openrouter", label: "OpenRouter", defaultUrl: "https://openrouter.ai/api/v1" },
  { value: "kenari", label: "Kenari Cloud", defaultUrl: "https://kenari.id/v1" },
  { value: "openai", label: "OpenAI Official", defaultUrl: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic Official", defaultUrl: "https://api.anthropic.com/v1" },
  { value: "mistral", label: "Mistral AI Official", defaultUrl: "https://api.mistral.ai/v1" },
  { value: "together", label: "Together AI", defaultUrl: "https://api.together.xyz/v1" },
  { value: "cohere", label: "Cohere (Command R+)", defaultUrl: "https://api.cohere.com/v2" },
  { value: "ollama", label: "Ollama (Local Host)", defaultUrl: "http://localhost:11434/v1" },
  { value: "lmstudio", label: "LM Studio (Local Host)", defaultUrl: "http://localhost:1234/v1" },
  { value: "9router", label: "9Router (Local Gateway)", defaultUrl: "http://localhost:20128/v1" },
  { value: "claude-code", label: "Claude Code CLI (Local Subscription)", defaultUrl: "http://127.0.0.1:20188/v1" },
  { value: "openai-compatible", label: "Other (Custom Endpoint)", defaultUrl: "" },
];



export const DEFAULT_MODELS: Record<string, string[]> = {
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "deepseek-r1-distill-llama-70b",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-thinking-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openrouter: [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemini-2.5-flash",
    "anthropic/claude-sonnet-4",
    "openai/gpt-4o",
    "meta-llama/llama-4-maverick:free",
  ],
  kenari: [
    "nemotron-3-super-120b-a12b:free",
    "glm-4-7-flash:free",
    "mistral-medium-3-5:free",
    "mimo-v2-5:free",
    "agnes-2-0-flash:free",
    "step-3-7-flash:free",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4-turbo"],
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
  ],
  mistral: [
    "mistral-large-latest",
    "mistral-small-latest",
    "codestral-latest",
    "ministral-8b-latest",
  ],
  together: [
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "deepseek-ai/DeepSeek-R1",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
  ],
  cohere: ["command-r-plus-08-2024", "command-r-08-2024"],
  ollama: ["llama3.3", "qwen2.5:72b", "deepseek-r1:14b", "mistral", "gemma2"],
  lmstudio: ["local-model"],
  "9router": [
    "cx/gpt-5.6-terra",
    "cx/gpt-5.5",
    "cx/gpt-5.4-mini",
    "cx/gpt-5.6-luna",
    "deepseek-r1",
    "claude-3-5-sonnet",
  ],
  "claude-code": [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
  ],
  "openai-compatible": [],
};

export function formatToastError(rawError?: string): string {
  if (!rawError) return "Endpoint unreachable";
  const str = String(rawError);

  if (str.includes("Header 'Authorization' has invalid value") || str.includes("kn-d4•") || str.includes("••••")) {
    return "Invalid API key format (contains placeholder dots)";
  }
  if (str.includes("ConnectTimeoutError") || str.includes("timeout") || str.includes("Timeout")) {
    return "Connection timed out (host unreachable)";
  }
  if (str.includes("401") || str.includes("Unauthorized") || str.includes("invalid_api_key")) {
    return "Unauthorized (401): Check API key";
  }
  if (str.includes("404") || str.includes("Not Found")) {
    return "Model or endpoint not found (404)";
  }
  if (str.includes("429") || str.includes("rate limit")) {
    return "Rate limit exceeded (429)";
  }
  if (str.includes("ENOTFOUND") || str.includes("ECONNREFUSED") || str.includes("fetch failed")) {
    return "Network error: Cannot reach endpoint";
  }

  // Strip nested Effect Cause([Fail(... (cause: ...))]) wrappers
  let cleaned = str
    .replace(/^Request failed:\s*/i, "")
    .replace(/Cause\(\[Fail\([^)]*\(cause:\s*/i, "")
    .replace(/^Cause\(\[Fail\([^:]*:\s*/i, "")
    .replace(/HttpClientError:\s*/i, "")
    .replace(/Transport error\s*\([^)]*\)\s*/i, "")
    .replace(/\)\)\]\)$/, "")
    .replace(/\)\]\)$/, "")
    .trim();

  if (cleaned.length > 70) {
    cleaned = cleaned.slice(0, 67) + "...";
  }
  return cleaned || "Endpoint error";
}

