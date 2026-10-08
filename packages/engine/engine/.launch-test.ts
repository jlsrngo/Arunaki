import http from "node:http"
import crossSpawn from "cross-spawn"

// A real OAuth authorize URL shape: several params separated by "&".
const url =
  "http://127.0.0.1:54999/oauth/authorize?response_type=code&client_id=9d1c250a-e61b&scope=a%20b%20c&code_challenge=XYZ&state=abc"

let received: string | null = null
const server = http.createServer((req, res) => {
  // The browser also asks for /favicon.ico; only the authorize request is interesting.
  if (!req.url?.includes("favicon") && received === null) received = req.url ?? ""
  res.writeHead(200, { "Content-Type": "text/html" })
  res.end("<html>ok</html>")
})
await new Promise<void>((r) => server.listen(54999, "127.0.0.1", () => r()))

const mode = process.argv[2]
if (mode === "old") crossSpawn("cmd.exe", ["/c", "start", '""', url], { windowsHide: true })
else crossSpawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true })

for (let i = 0; i < 25; i++) {
  await Bun.sleep(300)
  if (received) break
}
console.log(`${mode.toUpperCase()} launcher`)
console.log(`  received : ${received ?? "(nothing reached the server)"}`)
if (received) {
  const params = new URLSearchParams(received.split("?")[1] ?? "")
  console.log(`  params   : ${[...params.keys()].join(", ")}`)
  console.log(`  client_id: ${params.get("client_id") ?? "MISSING"}`)
  console.log(`  verdict  : ${params.get("client_id") ? "URL utuh" : "URL TERPOTONG"}`)
}
server.close()
process.exit(0)