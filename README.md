# Cursor FTP/SFTP Extension

VS Code–compatible extension for [Cursor](https://cursor.com). Connect to FTP or SFTP servers, browse remote files in the Explorer sidebar, and upload or download from the editor.

## Install (development)

1. Install dependencies and compile:

   ```bash
   cd cursor-ftp-sftp
   npm install
   npm run compile
   ```

2. In Cursor, open the Command Palette and run **Extensions: Install from VSIX…**, or press **F5** with this folder open to launch an Extension Development Host.

3. To package a `.vsix`:

   ```bash
   npm run package
   ```

   Then install the generated `cursor-ftp-sftp-0.1.0.vsix` via **Extensions: Install from VSIX…**.

## Configure profiles

Open the visual settings UI (no raw JSON required):

1. Run **FTP/SFTP: Open Settings** from the Command Palette (or use the gear on the Remote panel).
3. Create profiles, set default profile, toggle upload-on-save, and store passwords from the form.

Passwords are kept in Cursor secret storage, not in `settings.json`. For SFTP, use a private key path (optional passphrase) or a stored password.

Advanced users can still edit `cursorFtpSftp.profiles` in user settings if needed.

### Compatible with [vscode-sftp](https://github.com/Natizyskunk/vscode-sftp)

This extension reads the same **`.vscode/sftp.json`** format used by Natizyskunk’s SFTP extension (fork of liximomo). Existing project configs work without migration: profiles are merged with `cursorFtpSftp.profiles` (UI settings win on duplicate names).

Supported from `sftp.json` today:

- `protocol`, `host`, `port`, `username`, `password`, `remotePath`, `context` → local folder
- Nested `profiles` object (named sub-profiles)
- FTP: `secure` (`true` / `false` / `control` / `implicit`), `passive`, `secureOptions.rejectUnauthorized`
- SFTP: `privateKeyPath`, `passphrase`, `connectTimeout`, `ignore`

Patterns adopted from vscode-sftp: **serialized FTP commands** (one at a time), **FTPS certificate trust prompt**, and **workspace-based config**.

## Commands

| Command | Description |
|--------|-------------|
| FTP/SFTP: Connect | Pick a profile and connect |
| FTP/SFTP: Disconnect | Close the active session |
| FTP/SFTP: Upload Current File | Upload the active editor file (must be under `localPath`) |
| FTP/SFTP: Download File | Download a remote path to disk |
| FTP/SFTP: Upload Workspace Folder | Sync open workspace root to `remotePath` |
| FTP/SFTP: Sync Workspace to Remote | Sync profile `localPath` to `remotePath` |
| FTP/SFTP: Refresh Remote Explorer | Reload the remote tree |
| FTP/SFTP: Set Profile Password | Store password in secret storage |
| FTP/SFTP: Open Settings | Visual profile and preferences editor |
| FTP/SFTP: Show Remote Panel | Open the remote file tree on the right sidebar |

Connect, then use **Remote Files** in the **right sidebar** (secondary side bar) to browse the server. If the panel is hidden, run **FTP/SFTP: Show Remote Panel** or toggle the right sidebar. Right-click files to download or open; right-click folders to upload.

## Security notes

- Prefer SSH keys for SFTP; use secret storage for passwords.
- Do not commit passwords or private keys to the repo.
- `ignore` patterns skip sensitive paths during sync (defaults include `.git`, `node_modules`, `.env`).

## Development

```bash
npm install
npm run compile
npm run lint          # ESLint
npm run format:check  # Prettier
npm run test          # unit tests
npm run test:coverage # tests + coverage report (coverage/)
npm run check         # format, lint, compile, coverage
```

## Requirements

- Cursor or VS Code 1.93+ (right-sidebar remote tree)
- Node.js 18+ (for building the extension only)
