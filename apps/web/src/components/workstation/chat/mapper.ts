import { Message, MessagePart } from "./types";
import { formatToolStepLabel } from "../LiveExecutionBadge";

function isInternalToolPart(p: any): boolean {
  if (!p) return false;
  const input = p.state?.input || p.input || p.args || p.toolInvocation?.args || {};
  const target =
    input.TargetFile ||
    input.targetFile ||
    input.path ||
    input.filePath ||
    input.file ||
    (typeof input.command === "string" ? input.command : "") ||
    "";
  if (typeof target === "string" && target) {
    const raw = target.replace(/\\/g, "/");
    if (raw.includes(".arunaki") || raw.includes(".git") || raw.toLowerCase().includes("arunaki.md")) {
      return true;
    }
    const segments = raw.split("/").filter(Boolean);
    if (segments.some((s) => s.startsWith(".") && s !== "." && s !== "..")) {
      return true;
    }
  }
  return false;
}

function cleanReasoningTags(text: string): { cleanText: string; extractedThoughts: string[] } {
  if (!text) return { cleanText: "", extractedThoughts: [] };
  const thoughts: string[] = [];
  // 1. Extract complete <think>...</think> blocks
  const pairedRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  while ((match = pairedRegex.exec(text)) !== null) {
    const thought = match[1].trim();
    if (thought) thoughts.push(thought);
  }
  let clean = text.replace(pairedRegex, "");

  // 2. Extract unclosed <think>... until end if present
  const unclosedRegex = /<think>([\s\S]*)$/i;
  const unclosedMatch = clean.match(unclosedRegex);
  if (unclosedMatch) {
    const thought = unclosedMatch[1].trim();
    if (thought) thoughts.push(thought);
    clean = clean.replace(unclosedRegex, "");
  }

  // 3. Strip any stray / orphan </think>, </think?, <think>
  clean = clean.replace(/<\/?think\??>/gi, "").trim();

  return { cleanText: clean, extractedThoughts: thoughts };
}

export function mapEngineMessages(raw: any[]): Message[] {
  if (!Array.isArray(raw)) return [];

  const sortedRaw = [...raw]
    .filter((m) => {
      if (!m) return false;
      const t = m.type || m.role;
      if (t === "compaction" || t === "system" || t === "model-switched" || t === "plan") return false;
      return true;
    })
    .sort((a, b) => {
      const timeA = Number(a.time?.created ?? a.time_created ?? a.time?.start ?? 0);
      const timeB = Number(b.time?.created ?? b.time_created ?? b.time?.start ?? 0);
      return timeA - timeB;
    });

  const individualMessages: Message[] = sortedRaw.map((msg, idx) => {
    const role: "user" | "assistant" = msg.type === "user" || msg.role === "user" ? "user" : "assistant";
    let content = "";
    let reasoning = "";
    let executionSteps: any[] | undefined = undefined;
    let thoughtSec: number | undefined = undefined;
    let thoughtMs: number | undefined = undefined;
    const parts: MessagePart[] = [];

    // 1. Text & reasoning from msg.content / msg.text
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (typeof msg.text === "string") {
      content = msg.text;
    } else if (Array.isArray(msg.content)) {
      const reasoningParts = msg.content.filter((p: any) => p && p.type === "reasoning");
      if (reasoningParts.length > 0) {
        reasoning = reasoningParts
          .map((p: any) => (p && typeof p.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n\n");
        let totalReasoningTime = 0;
        reasoningParts.forEach((p: any) => {
          if (p.time?.start && p.time?.end && p.time.end > p.time.start) {
            totalReasoningTime += (p.time.end - p.time.start);
          } else if (p.time?.created && p.time?.completed && p.time.completed > p.time.created) {
            totalReasoningTime += (p.time.completed - p.time.created);
          } else if (p.time?.created && msg.time?.updated && msg.time.updated > p.time.created) {
            totalReasoningTime += (msg.time.updated - p.time.created);
          } else if (p.time_created && p.time_updated && p.time_updated > p.time_created) {
            totalReasoningTime += (p.time_updated - p.time_created);
          }
        });
        thoughtMs = totalReasoningTime > 0 ? totalReasoningTime : undefined;
        thoughtSec = totalReasoningTime > 0 ? Math.max(1, Math.round(totalReasoningTime / 1000)) : 1;
      }

      const textParts = msg.content.filter((p: any) => p && p.type === "text" && typeof p.text === "string");
      content = textParts.map((p: any) => p.text).join("");

      const toolParts = msg.content.filter(
        (p: any) =>
          p &&
          (p.type === "tool" || p.type === "tool-invocation") &&
          !isInternalToolPart(p) &&
          (p.name || p.tool || p.toolInvocation?.toolName || "").toLowerCase() !== "question"
      );
      if (toolParts.length > 0) {
        executionSteps = toolParts.map((t: any, i: number) => {
          const toolName = t.name || t.tool || t.toolInvocation?.toolName || "action";
          const input = t.state?.input || t.input || t.args || t.toolInvocation?.args || {};
          const isError = t.state?.status === "error" || t.state?.status === "failed" || Boolean(t.error) || Boolean(t.state?.error) || Boolean(t.state?.metadata?.blocked);
          const status = isError ? "failed" : (t.state?.status === "running" ? "running" : "completed");
          const label = formatToolStepLabel(toolName, input, true);
          return {
            id: t.id || `tool-${idx}-${i}`,
            label,
            status,
            iconType: "tool",
            toolName,
          };
        });
      }
    }

    // 2. Text & reasoning from msg.parts
    if (Array.isArray(msg.parts)) {
      const reasoningParts = msg.parts.filter((p: any) => p && p.type === "reasoning");
      if (reasoningParts.length > 0) {
        reasoning = reasoningParts
          .map((p: any) => (p && typeof p.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n\n");
        let totalReasoningTime = 0;
        reasoningParts.forEach((p: any) => {
          if (p.time?.start && p.time?.end && p.time.end > p.time.start) {
            totalReasoningTime += (p.time.end - p.time.start);
          } else if (p.time?.created && p.time?.completed && p.time.completed > p.time.created) {
            totalReasoningTime += (p.time.completed - p.time.created);
          } else if (p.time?.created && msg.time?.updated && msg.time.updated > p.time.created) {
            totalReasoningTime += (msg.time.updated - p.time.created);
          } else if (p.time_created && p.time_updated && p.time_updated > p.time_created) {
            totalReasoningTime += (p.time_updated - p.time_created);
          }
        });
        thoughtMs = totalReasoningTime > 0 ? totalReasoningTime : undefined;
        thoughtSec = totalReasoningTime > 0 ? Math.max(1, Math.round(totalReasoningTime / 1000)) : 1;
      }

      const toolInvocations = msg.parts.filter(
        (p: any) =>
          p &&
          (p.type === "tool" || p.type === "tool-invocation") &&
          !isInternalToolPart(p) &&
          (p.name || p.tool || p.toolInvocation?.toolName || "").toLowerCase() !== "question"
      );
      if (toolInvocations.length > 0) {
        executionSteps = toolInvocations.map((t: any, i: number) => {
          const toolName = t.name || t.tool || t.toolInvocation?.toolName || "action";
          const input = t.state?.input || t.input || t.args || t.toolInvocation?.args || {};
          const isError = t.state?.status === "error" || t.state?.status === "failed" || Boolean(t.error) || Boolean(t.state?.error) || Boolean(t.state?.metadata?.blocked);
          const status = isError ? "failed" : (t.state?.status === "running" ? "running" : "completed");
          const label = formatToolStepLabel(toolName, input, true);
          return {
            id: t.id || `tool-${idx}-${i}`,
            label,
            status,
            iconType: "tool",
            toolName,
          };
        });
      }

      const textParts = msg.parts.filter((p: any) => p && p.type === "text" && typeof p.text === "string");
      content = textParts.map((p: any) => p.text).join("");
    }

    if (!content && msg.error?.message) {
      content = `⚠️ ${msg.error.message}`;
    }

    if (role === "assistant" && !thoughtSec) {
      const startTime = msg.time?.created || msg.time_created || msg.time?.start;
      const endTime = msg.time?.updated || msg.time_updated || msg.time?.end;
      if (startTime && endTime && endTime > startTime) {
        thoughtMs = endTime - startTime;
        thoughtSec = Math.max(1, Math.round((endTime - startTime) / 1000));
      } else {
        thoughtMs = 488;
        thoughtSec = 1;
      }
    }

    // Extract <think>...</think> tags and strip any stray/orphan thinking tags
    const { cleanText: cleanedContent, extractedThoughts } = cleanReasoningTags(content);
    if (extractedThoughts.length > 0) {
      reasoning = (reasoning ? reasoning + "\n\n" : "") + extractedThoughts.join("\n\n");
    }
    content = cleanedContent;

    // 3. Build chronological parts
    const sourceArray = Array.isArray(msg.parts) ? msg.parts : Array.isArray(msg.content) ? msg.content : [];
    sourceArray.forEach((p: any, pIdx: number) => {
      if (!p) return;
      if (p.type === "reasoning" && typeof p.text === "string" && p.text.trim()) {
        let durSec: number | undefined = undefined;
        let durMs: number | undefined = undefined;
        if (p.time?.start && p.time?.end && p.time.end > p.time.start) {
          durMs = p.time.end - p.time.start;
          durSec = Math.max(1, Math.round(durMs / 1000));
        }
        parts.push({
          type: "thought",
          text: p.text.trim(),
          durationSec: durSec || thoughtSec,
          durationMs: durMs || thoughtMs,
        });
      } else if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
        const { cleanText: cleanedPartText, extractedThoughts: partThoughts } = cleanReasoningTags(p.text);
        if (partThoughts.length > 0) {
          reasoning = (reasoning ? reasoning + "\n\n" : "") + partThoughts.join("\n\n");
        }
        if (cleanedPartText.length > 0) {
          parts.push({
            type: "text",
            text: cleanedPartText,
          });
        }
      } else if ((p.type === "tool" || p.type === "tool-invocation") && !isInternalToolPart(p)) {
        const toolName = p.name || p.tool || p.toolInvocation?.toolName || "action";
        const input = p.state?.input || p.input || p.args || p.toolInvocation?.args || {};

        if (toolName.toLowerCase() === "question") {
          const rawQuestions = Array.isArray(input.questions)
            ? input.questions
            : input.question
            ? [input]
            : [];
          if (rawQuestions.length > 0) {
            const isAnswered =
              p.state?.status === "completed" ||
              Boolean(p.state?.structured?.answers?.length) ||
              Boolean(p.state?.content?.some((c: any) => c.text?.includes("User has answered")));
            const selectedAnswer =
              p.state?.structured?.answers?.[0]?.[0] ||
              p.state?.content?.[0]?.text?.match(/="([^"]+)"/)?.[1] ||
              undefined;
            parts.push({
              type: "question",
              data: {
                id: p.id || `que-${idx}-${pIdx}`,
                sessionID: msg.sessionID || "",
                questions: rawQuestions,
                answered: isAnswered,
                selectedAnswer,
              },
            });
            return;
          }
        }

        const isError = p.state?.status === "error" || p.state?.status === "failed" || Boolean(p.error) || Boolean(p.state?.error) || Boolean(p.state?.metadata?.blocked);
        const status = isError ? "failed" : (p.state?.status === "running" ? "running" : "completed");
        const label = formatToolStepLabel(toolName, input, true);
        parts.push({
          type: "tool",
          step: {
            id: p.id || `tool-${idx}-${pIdx}`,
            label,
            status,
            iconType: "tool",
            toolName,
          },
        });
      }
    });

    if (parts.length === 0 && role === "assistant") {
      if (reasoning.trim()) {
        parts.push({
          type: "thought",
          text: reasoning.trim(),
          durationSec: thoughtSec,
          durationMs: thoughtMs,
        });
      }
      if (executionSteps && executionSteps.length > 0) {
        executionSteps.forEach((s) => parts.push({ type: "tool", step: s }));
      }
      if (content.trim()) {
        parts.push({
          type: "text",
          text: content.trim(),
        });
      }
    }

    if (role === "assistant" && reasoning.trim().length > 0 && !parts.some((p) => p.type === "thought")) {
      parts.unshift({
        type: "thought",
        text: reasoning.trim(),
        durationSec: thoughtSec,
        durationMs: thoughtMs,
      });
    } else if (role === "assistant") {
      const existingThought = parts.find((p) => p.type === "thought");
      if (existingThought && !existingThought.text && reasoning.trim()) {
        existingThought.text = reasoning.trim();
      }
    }

    const rawFiles = msg.files || msg.data?.files || msg.attachments;
    const mappedFiles = Array.isArray(rawFiles) && rawFiles.length > 0
      ? rawFiles.map((f: any) => ({
          name: f.name || f.filename,
          uri: f.uri || f.url,
          mime: f.mime || f.mediaType,
          description: f.description,
        }))
      : undefined;

    return {
      id: msg.id || `${role}-${idx}-${Date.now()}`,
      role,
      content,
      reasoning: reasoning.trim() || undefined,
      executionSteps: executionSteps || undefined,
      thoughtSec: thoughtSec,
      thoughtMs: thoughtMs,
      parts: parts.length > 0 ? parts : undefined,
      question: (parts.find((p) => p.type === "question") as any)?.data,
      files: mappedFiles,
      createdAt: msg.createdAt || msg.time?.created || (msg.time?.start ? msg.time.start : undefined),
    };
  });

  // Group consecutive assistant messages belonging to the same turn
  const mergedMessages: Message[] = [];
  for (const m of individualMessages) {
    const last = mergedMessages[mergedMessages.length - 1];
    if (last && last.role === "assistant" && m.role === "assistant") {
      if (m.content) {
        last.content = last.content ? `${last.content}\n\n${m.content}` : m.content;
      }
      if (m.parts && m.parts.length > 0) {
        last.parts = [...(last.parts || []), ...m.parts];
      }
      if (m.reasoning) {
        if (!last.reasoning) {
          last.reasoning = m.reasoning;
        } else {
          const existingParas = new Set(
            last.reasoning
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
          );
          const newParas = m.reasoning
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter((p) => p && !existingParas.has(p));
          if (newParas.length > 0) {
            last.reasoning = `${last.reasoning}\n\n${newParas.join("\n\n")}`;
          }
        }
      }
      if (m.executionSteps) {
        const existingLabels = new Set((last.executionSteps || []).map((s) => s.label));
        const newSteps = m.executionSteps.filter((s) => !existingLabels.has(s.label));
        last.executionSteps = [...(last.executionSteps || []), ...newSteps];
      }
      if (m.thoughtSec) {
        last.thoughtSec = (last.thoughtSec || 0) + m.thoughtSec;
      }
      if (m.createdAt) {
        last.createdAt = m.createdAt;
      }
      last.id = m.id;
    } else {
      mergedMessages.push({ ...m });
    }
  }

  return mergedMessages;
}

