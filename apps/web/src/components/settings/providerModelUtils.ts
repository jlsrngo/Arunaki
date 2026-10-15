export function isFreeModel(name: string): boolean {
  return name.toLowerCase().includes("free");
}

export function getModelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "Claude";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("gemini") || lower.includes("google")) return "Gemini";
  if (
    lower.includes("gpt") ||
    lower.includes("openai") ||
    lower.includes("o1") ||
    lower.includes("o3")
  )
    return "GPT";
  if (lower.includes("qwen")) return "Qwen";
  if (
    lower.includes("glm") ||
    lower.includes("z-ai") ||
    lower.includes("zhipu")
  )
    return "GLM";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "Kimi";
  if (lower.includes("minimax")) return "MiniMax";
  if (lower.includes("nemotron") || lower.includes("nvidia")) return "Nemotron";
  if (
    lower.includes("mistral") ||
    lower.includes("codestral") ||
    lower.includes("voxtral")
  )
    return "Mistral";
  if (lower.includes("step")) return "StepFun";
  if (lower.includes("mimo") || lower.includes("xiaomi")) return "Mimo";
  if (lower.includes("grok") || lower.includes("xai")) return "Grok";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama") || lower.includes("meta")) return "Llama";
  if (lower.includes("agnes")) return "Agnes";
  if (lower.includes("/")) {
    const prefix = lower.split("/")[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return "Other";
}
