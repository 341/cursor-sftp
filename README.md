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

Add profiles in user or workspace settings (`settings.json`):

```json
{
  "cursorFtpSftp.defaultProfile": "wolt-dev",
  "cursorFtpSftp.uploadOnSave": false,
  "cursorFtpSftp.profiles": [
    {
      "name": "wolt-dev",
      "protocol": "sftp",
      "host": "sftp.example.com",
      "port": 22,
      "username": "venue-user",
      "remotePath": "/incoming",
      "localPath": "${workspaceFolder}/wolt",
      "privateKeyPath": "~/.ssh/wolt_dev",
      "ignore": ["**/.git/**", "**/node_modules/**", "**/.env"]
    },
    {
      "name": "staging-ftp",
      "protocol": "ftp",
      "host": "ftp.example.com",
      "port": 21,
      "username": "deploy",
      "remotePath": "/public_html",
      "secure": true
    }
  ]
}
```

Store passwords with **FTP/SFTP: Set Profile Password (Secret Storage)** — they are kept in Cursor’s secret storage, not in `settings.json`.

For SFTP key-based auth, set `privateKeyPath` (and optional `passphrase`) instead of a password.

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

Use the **FTP/SFTP Remote** view in the Explorer after connecting. Right-click remote files to download or open; right-click folders to upload files into that directory.

## Security notes

- Prefer SSH keys for SFTP; use secret storage for passwords.
- Do not commit passwords or private keys to the repo.
- `ignore` patterns skip sensitive paths during sync (defaults include `.git`, `node_modules`, `.env`).

## Requirements

- Cursor or VS Code 1.85+
- Node.js 18+ (for building the extension only)
