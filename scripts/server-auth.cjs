const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * The engine already had HTTP Basic auth the whole time (engine/src/server/auth.ts), but nothing
 * ever set Arunaki_SERVER_PASSWORD, so it logged "server is unsecured" and answered every caller on
 * the machine. A plain request with no credentials got HTTP 200 and the full payload.
 *
 * VSCode Remote and code-server both mint a password per start. This is the same thing, and it is
 * what closes the browser path: a page on any origin hitting 127.0.0.1:4096 now gets 401.
 *
 * Lives in its own module rather than inside dev-app.cjs because that file is marked
 * skip-worktree as machine-local. Security that only exists on one developer's machine is not a
 * security control.
 */

/** Where the current credentials are written so out-of-band tools (the smoke test) can read them. */
const PASSWORD_FILE = path.join(os.homedir(), '.arunaki', 'dev-server-password')

/**
 * Fresh password per start, so a copy left on disk stops working at the next launch.
 * Falls back to no password if the file cannot be written - the caller decides what to do.
 */
function create() {
  const username = process.env.ARUNAKI_SERVER_USERNAME || 'arunaki'
  const password = crypto.randomBytes(24).toString('base64url')

  let written = false
  try {
    fs.mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true })
    fs.writeFileSync(PASSWORD_FILE, `${username}:${password}`, { encoding: 'utf8', mode: 0o600 })
    written = true
  } catch (e) {
    console.warn('[server-auth] could not write password file:', e.message)
  }

  return {
    username,
    password,
    written,
    file: PASSWORD_FILE,
    /** For the engine process. */
    engineEnv: { Arunaki_SERVER_USERNAME: username, Arunaki_SERVER_PASSWORD: password },
    /** Vite only exposes VITE_-prefixed vars to the client, and reads them from its own env at start. */
    clientEnv: {
      VITE_ARUNAKI_SERVER_USER: username,
      VITE_ARUNAKI_SERVER_PASSWORD: password,
    },
    /** Basic header value, for tools outside the browser such as the smoke test. */
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  }
}

/** Reads the credentials the launcher wrote on its last start. */
function read() {
  const [user, password] = fs.readFileSync(PASSWORD_FILE, 'utf8').trim().split(':')
  if (!user || !password) throw new Error('malformed password file')
  return { username: user, password }
}

module.exports = { PASSWORD_FILE, create, read }