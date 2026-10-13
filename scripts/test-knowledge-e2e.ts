import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

const PASSWORD_FILE = path.join(os.homedir(), ".arunaki", "dev-server-password")
const HEALTH_URL = "http://127.0.0.1:4096/api/health"
const BASE_URL = "http://127.0.0.1:4096/api"

function getAuthHeaders(): Record<string, string> {
  try {
    const raw = fs.readFileSync(PASSWORD_FILE, "utf8").trim()
    const [user, password] = raw.split(":")
    if (user && password) {
      return { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` }
    }
  } catch {}
  return {}
}

async function isEngineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    })
    const j: any = await res.json().catch(() => ({}))
    return j?.healthy === true
  } catch {
    return false
  }
}

async function ensureEngineRunning(): Promise<{ proc?: any; startedByUs: boolean }> {
  if (await isEngineHealthy()) {
    console.log("-> Arunaki engine is already running and healthy.")
    return { startedByUs: false }
  }

  console.log("-> Engine is not running. Starting Arunaki engine on port 4096...")
  const serverAuth = require("../scripts/server-auth.cjs")
  const auth = serverAuth.create()

  const repoDir = process.cwd()
  const proc = spawn(
    "bun",
    [
      "run",
      "--conditions=browser",
      path.join(repoDir, "packages", "engine", "engine", "src", "serve-only.ts"),
      "serve",
      "--port",
      "4096",
    ],
    {
      cwd: repoDir,
      env: { ...process.env, ...auth.engineEnv },
      stdio: "pipe",
      windowsHide: true,
      shell: false,
    },
  )

  proc.stderr?.on("data", (d: any) => {
    const msg = d.toString()
    if (msg.includes("Error") || msg.includes("error")) {
      console.error("[engine stderr]:", msg.trim())
    }
  })

  // Poll until healthy
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (await isEngineHealthy()) {
      console.log("-> Arunaki engine successfully started and healthy.")
      return { proc, startedByUs: true }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  throw new Error("Timeout waiting for engine to become healthy after 60s.")
}

async function main() {
  console.log("==================================================================")
  console.log("🚀 ARUNAKI END-TO-END KNOWLEDGE LIVE TEST")
  console.log("==================================================================")

  // 1. Create a brand new workspace folder
  const testDir = path.join(os.tmpdir(), `arunaki-test-katalog-${Date.now()}`)
  const arunakiDir = path.join(testDir, ".arunaki")
  fs.mkdirSync(arunakiDir, { recursive: true })
  console.log(`\n1. Created new test directory:\n   ${testDir}`)

  // 2. Create a new knowledge node inside .arunaki/knowledge.json
  const knowledgePayload = {
    nodes: [
      {
        id: "node-kopi-senja-test",
        title: "Katalog Warung Kopi Senja",
        type: "catalog",
        active: true,
        content:
          "Menu andalan: Kopi Gula Aren Tubruk seharga Rp 18.000 (stok harian 50 gelas). Pemilik warung: Mas Bayu. Catatan: Diskon 10% jika bawa tumbler sendiri.",
      },
    ],
  }
  const knowledgeFile = path.join(arunakiDir, "knowledge.json")
  fs.writeFileSync(knowledgeFile, JSON.stringify(knowledgePayload, null, 2), "utf8")
  console.log(`2. Created Knowledge node in .arunaki/knowledge.json:\n   Title: "${knowledgePayload.nodes[0].title}"\n   Notes: "${knowledgePayload.nodes[0].content}"`)

  // 3. Ensure Engine is running
  const { proc, startedByUs } = await ensureEngineRunning()

  try {
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    }
    const query = `?directory=${encodeURIComponent(testDir)}`

    // 4. Connect to Arunaki: Create Session
    console.log(`\n3. Connecting directory to Arunaki via POST /api/session...`)
    const sessionRes = await fetch(`${BASE_URL}/session${query}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        location: { directory: testDir },
        model: { providerID: "kiro", id: "kiro/auto" },
      }),
    })
    const sessionJson: any = await sessionRes.json()
    const sessionId = sessionJson?.data?.id
    if (!sessionId) {
      throw new Error(`Failed to create session: ${JSON.stringify(sessionJson)}`)
    }
    console.log(`   Session created successfully! Session ID: ${sessionId}`)
    console.log(`   Location directory: ${sessionJson?.data?.location?.directory}`)

    // 5. Query 1: Ask LLM about the knowledge node content
    const question1 = "Halo Arunaki, apa menu andalan di Warung Kopi Senja, berapa harganya, dan siapa pemiliknya?"
    console.log(`\n4. Sending Prompt to LLM:\n   User: "${question1}"`)

    const promptRes = await fetch(`${BASE_URL}/session/${sessionId}/prompt${query}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: { text: question1 },
      }),
    })
    const promptJson: any = await promptRes.json().catch(() => ({}))
    if (promptJson?.error) {
      throw new Error(`Prompt rejected: ${JSON.stringify(promptJson)}`)
    }

    console.log(`   Waiting for assistant's response...`)
    let reply1Text = ""
    let reply1Id = ""
    const deadline1 = Date.now() + 90000
    while (Date.now() < deadline1) {
      const msgRes = await fetch(`${BASE_URL}/session/${sessionId}/message${query}`, { headers })
      const msgJson: any = await msgRes.json().catch(() => ({}))
      const assistantMsg = (msgJson?.data || []).find(
        (m: any) => m?.type === "assistant" && Array.isArray(m?.content) && m?.content.length > 0,
      )
      if (assistantMsg) {
        const textPart = assistantMsg.content.find((c: any) => c.type === "text")
        if (textPart?.text?.trim()) {
          reply1Text = textPart.text.trim()
          reply1Id = assistantMsg.id
          break
        }
      }
      await new Promise((r) => setTimeout(r, 1500))
    }

    if (!reply1Text) {
      throw new Error("No response received from assistant within 90s.")
    }

    console.log(`\n📥 LLM Response:`)
    console.log("------------------------------------------------------------------")
    console.log(reply1Text)
    console.log("------------------------------------------------------------------")

    // Assertions for Question 1
    const lower1 = reply1Text.toLowerCase()
    const knowsMenu = lower1.includes("kopi gula aren") || lower1.includes("gula aren tubruk")
    const knowsPrice = lower1.includes("18.000") || lower1.includes("18000") || lower1.includes("18 rb")
    const knowsOwner = lower1.includes("bayu")
    const requestedUpload = lower1.includes("unggah file") || lower1.includes("upload file") || lower1.includes("berikan file excel")

    console.log("\n📊 Verification Checks (Question 1):")
    console.log(`   - Tahu menu andalan ("Kopi Gula Aren Tubruk"): ${knowsMenu ? "✅ PASS" : "❌ FAIL"}`)
    console.log(`   - Tahu harga ("Rp 18.000"):                   ${knowsPrice ? "✅ PASS" : "❌ FAIL"}`)
    console.log(`   - Tahu pemilik ("Mas Bayu"):                  ${knowsOwner ? "✅ PASS" : "❌ FAIL"}`)
    console.log(`   - Tidak meminta user mengunggah file:         ${!requestedUpload ? "✅ PASS" : "❌ FAIL"}`)

    if (!knowsMenu || !knowsPrice || !knowsOwner) {
      console.error("\n❌ LLM did not recognize the knowledge data!")
    } else {
      console.log("\n🎉 LLM BERHASIL MENGETAHUI DATA DARI KNOWLEDGE NODE!")
    }

    // 6. Query 2: Test knowledge menu awareness
    const question2 = "Di mana biasanya saya bisa mengelola atau menghubungkan data katalog seperti ini di Arunaki?"
    console.log(`\n5. Sending Prompt 2:\n   User: "${question2}"`)

    await fetch(`${BASE_URL}/session/${sessionId}/prompt${query}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: { text: question2 },
      }),
    })

    let reply2Text = ""
    let reply2Id = ""
    const deadline2 = Date.now() + 90000
    while (Date.now() < deadline2) {
      const msgRes = await fetch(`${BASE_URL}/session/${sessionId}/message${query}`, { headers })
      const msgJson: any = await msgRes.json().catch(() => ({}))
      const assistantMsgs = (msgJson?.data || []).filter(
        (m: any) => m?.type === "assistant" && Array.isArray(m?.content) && m?.content.length > 0,
      )
      // Pick newest message that is not reply1
      const newestAssistant = assistantMsgs.find((m: any) => m.id !== reply1Id && m.id)
      if (newestAssistant) {
        const textPart = newestAssistant.content.find((c: any) => c.type === "text")
        if (textPart?.text?.trim()) {
          reply2Text = textPart.text.trim()
          reply2Id = newestAssistant.id
          break
        }
      }
      await new Promise((r) => setTimeout(r, 1500))
    }

    console.log(`\n📥 LLM Response 2:`)
    console.log("------------------------------------------------------------------")
    console.log(reply2Text)
    console.log("------------------------------------------------------------------")

    const lower2 = reply2Text.toLowerCase()
    const knowsMenuAwareness = lower2.includes("knowledge") || lower2.includes("/knowledge")
    console.log("\n📊 Verification Checks (Question 2):")
    console.log(`   - Sadar menu Knowledge di Arunaki (/knowledge): ${knowsMenuAwareness ? "✅ PASS" : "❌ FAIL"}`)

    // Cleanup session
    await fetch(`${BASE_URL}/session/${sessionId}${query}`, {
      method: "DELETE",
      headers,
    }).catch(() => {})
  } finally {
    // Cleanup temporary folder
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
      console.log(`\n🧹 Cleaned up temporary test folder: ${testDir}`)
    } catch {}

    // Cleanup engine if started by us
    if (startedByUs && proc) {
      console.log("🧹 Stopping Arunaki engine process started by test...")
      try {
        proc.kill("SIGTERM")
      } catch {}
    }
  }

  console.log("\n==================================================================")
  console.log("✅ TEST SELESAI")
  console.log("==================================================================")
}

main().catch((err) => {
  console.error("Test execution failed:", err)
  process.exit(1)
})
