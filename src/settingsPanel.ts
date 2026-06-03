import * as vscode from 'vscode';
import {
  DEFAULT_IGNORE_PATTERNS,
  deleteProfilePassword,
  getDefaultProfileName,
  getProfiles,
  getUploadOnSave,
  hasProfilePassword,
  saveProfiles,
  setDefaultProfile,
  setProfilePassword,
  setUploadOnSave,
} from './profiles';
import { FtpSftpProfile } from './types';

type PanelMessage =
  | { type: 'ready' }
  | { type: 'saveProfile'; profile: FtpSftpProfile; previousName?: string }
  | { type: 'deleteProfile'; name: string }
  | { type: 'saveGeneral'; defaultProfile: string; uploadOnSave: boolean }
  | { type: 'setPassword'; name: string }
  | { type: 'clearPassword'; name: string }
  | { type: 'pickLocalFolder' }
  | { type: 'pickPrivateKey' }
  | { type: 'connect'; name: string };

type StateMessage = {
  type: 'state';
  profiles: FtpSftpProfile[];
  defaultProfile: string;
  uploadOnSave: boolean;
  passwordSet: Record<string, boolean>;
};

type PanelResponse =
  | StateMessage
  | { type: 'pickedPath'; field: 'localPath' | 'privateKeyPath'; path: string }
  | { type: 'toast'; level: 'info' | 'error'; message: string };

let panel: vscode.WebviewPanel | undefined;

export function openSettingsPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'cursorFtpSftp.settings',
    'FTP/SFTP Settings',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'ftp-sftp.svg');
  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (msg: PanelMessage) => {
    try {
      switch (msg.type) {
        case 'ready':
          await sendState(panel!.webview, context);
          break;
        case 'saveProfile':
          await handleSaveProfile(context, msg.profile, msg.previousName);
          await sendState(panel!.webview, context);
          postToast(panel!.webview, 'info', `Saved profile "${msg.profile.name}"`);
          break;
        case 'deleteProfile':
          await handleDeleteProfile(context, msg.name);
          await sendState(panel!.webview, context);
          postToast(panel!.webview, 'info', `Deleted profile "${msg.name}"`);
          break;
        case 'saveGeneral':
          await setDefaultProfile(msg.defaultProfile);
          await setUploadOnSave(msg.uploadOnSave);
          await sendState(panel!.webview, context);
          postToast(panel!.webview, 'info', 'Preferences saved');
          break;
        case 'setPassword':
          await handleSetPassword(context, msg.name);
          await sendState(panel!.webview, context);
          break;
        case 'clearPassword':
          await deleteProfilePassword(context, msg.name);
          await sendState(panel!.webview, context);
          postToast(panel!.webview, 'info', 'Password removed');
          break;
        case 'pickLocalFolder': {
          const folder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select local sync folder',
          });
          if (folder?.[0]) {
            postPath(panel!.webview, 'localPath', folder[0].fsPath);
          }
          break;
        }
        case 'pickPrivateKey': {
          const file = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select private key',
          });
          if (file?.[0]) {
            postPath(panel!.webview, 'privateKeyPath', file[0].fsPath);
          }
          break;
        }
        case 'connect':
          await vscode.commands.executeCommand('cursorFtpSftp.connect', msg.name);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postToast(panel!.webview, 'error', message);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

async function sendState(webview: vscode.Webview, context: vscode.ExtensionContext): Promise<void> {
  const profiles = getProfiles();
  const passwordSet: Record<string, boolean> = {};
  for (const p of profiles) {
    passwordSet[p.name] = await hasProfilePassword(context, p.name);
  }
  const payload: StateMessage = {
    type: 'state',
    profiles,
    defaultProfile: getDefaultProfileName(),
    uploadOnSave: getUploadOnSave(),
    passwordSet,
  };
  webview.postMessage(payload);
}

function postToast(webview: vscode.Webview, level: 'info' | 'error', message: string): void {
  const payload: PanelResponse = { type: 'toast', level, message };
  webview.postMessage(payload);
}

function postPath(
  webview: vscode.Webview,
  field: 'localPath' | 'privateKeyPath',
  path: string,
): void {
  const payload: PanelResponse = { type: 'pickedPath', field, path };
  webview.postMessage(payload);
}

async function handleSaveProfile(
  context: vscode.ExtensionContext,
  profile: FtpSftpProfile,
  previousName?: string,
): Promise<void> {
  const profiles = getProfiles();
  const name = profile.name.trim();
  if (!name) {
    throw new Error('Profile name is required');
  }
  const duplicate = profiles.find((p) => p.name === name && p.name !== (previousName ?? '').trim());
  if (duplicate) {
    throw new Error(`Profile "${name}" already exists`);
  }

  const next = profiles.filter((p) => p.name !== (previousName ?? profile.name).trim());
  next.push({ ...profile, name });
  await saveProfiles(next);

  const defaultName = getDefaultProfileName();
  if (previousName && defaultName === previousName) {
    await setDefaultProfile(name);
  }
  if (!defaultName && next.length === 1) {
    await setDefaultProfile(name);
  }

  if (previousName && previousName !== name) {
    const pwd = await context.secrets.get('cursorFtpSftp.password.' + previousName);
    if (pwd) {
      await setProfilePassword(context, name, pwd);
      await deleteProfilePassword(context, previousName);
    }
  }
}

async function handleDeleteProfile(context: vscode.ExtensionContext, name: string): Promise<void> {
  const profiles = getProfiles().filter((p) => p.name !== name);
  await saveProfiles(profiles);
  await deleteProfilePassword(context, name);
  if (getDefaultProfileName() === name) {
    await setDefaultProfile(profiles[0]?.name ?? '');
  }
}

async function handleSetPassword(
  context: vscode.ExtensionContext,
  profileName: string,
): Promise<void> {
  const password = await vscode.window.showInputBox({
    prompt: `Password for "${profileName}"`,
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    return;
  }
  await setProfilePassword(context, profileName, password);
}

function getWebviewHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FTP/SFTP Settings</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px 24px 32px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.45;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin: 0 0 24px;
      font-size: 0.92rem;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(220px, 280px) 1fr;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 720px) {
      .layout { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 8px;
      overflow: hidden;
    }
    .card-header {
      padding: 12px 14px;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .profile-list { list-style: none; margin: 0; padding: 6px; }
    .profile-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.12s;
    }
    .profile-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .profile-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-color: var(--vscode-focusBorder);
    }
    .profile-item .badge {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      text-transform: uppercase;
      font-weight: 600;
    }
    .profile-meta {
      flex: 1;
      min-width: 0;
    }
    .profile-meta strong {
      display: block;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .profile-meta span {
      font-size: 0.78rem;
      opacity: 0.85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty-list {
      padding: 24px 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.88rem;
    }
    .form-body { padding: 18px 20px 20px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .row.full { grid-template-columns: 1fr; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--vscode-descriptionForeground);
    }
    label strong { color: var(--vscode-foreground); font-weight: 500; }
    input, select, textarea {
      font: inherit;
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    input:focus, select:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    textarea { min-height: 72px; resize: vertical; font-family: var(--vscode-editor-font-family); font-size: 0.85rem; }
    .protocol-toggle {
      display: flex;
      gap: 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    }
    .protocol-toggle button {
      flex: 1;
      border: none;
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      padding: 10px;
      cursor: pointer;
      font: inherit;
      font-weight: 500;
    }
    .protocol-toggle button.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .input-with-btn {
      display: flex;
      gap: 8px;
    }
    .input-with-btn input { flex: 1; }
    .btn {
      font: inherit;
      padding: 8px 14px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-weight: 500;
      white-space: nowrap;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    }
    .btn-danger {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-inputValidation-errorForeground, #f88);
    }
    .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    }
    .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
    }
    .checkbox-row input { width: auto; margin: 0; }
    .hidden { display: none !important; }
    .prefs { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
    .toast {
      position: fixed;
      bottom: 16px;
      right: 16px;
      max-width: 320px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 0.88rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }
    .toast.info {
      background: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
      color: var(--vscode-editor-background);
    }
    .toast.error {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } }
    .pw-status {
      font-size: 0.82rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .pw-status.set { color: var(--vscode-testing-iconPassed, #89d185); }
  </style>
</head>
<body>
  <h1>FTP / SFTP</h1>
  <p class="subtitle">Manage connection profiles without editing raw JSON. Passwords stay in secure storage.</p>

  <div class="layout">
    <aside>
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <span>Profiles</span>
          <button type="button" class="btn btn-sm btn-primary" id="btnNew">+ New</button>
        </div>
        <ul class="profile-list" id="profileList"></ul>
        <div class="empty-list hidden" id="emptyList">No profiles yet. Create one to get started.</div>
      </div>
      <div class="card">
        <div class="card-header">Preferences</div>
        <div class="prefs">
          <label>
            <strong>Default profile</strong>
            <select id="defaultProfile"></select>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="uploadOnSave" />
            <strong>Upload on save</strong>
          </label>
          <button type="button" class="btn btn-secondary btn-sm" id="btnSavePrefs">Save preferences</button>
        </div>
      </div>
    </aside>

    <section class="card">
      <div class="card-header" id="formTitle">New profile</div>
      <div class="form-body">
        <div class="row">
          <label><strong>Profile name</strong><input type="text" id="name" placeholder="e.g. production" /></label>
          <label>
            <strong>Protocol</strong>
            <div class="protocol-toggle">
              <button type="button" data-protocol="sftp" id="protoSftp">SFTP</button>
              <button type="button" data-protocol="ftp" id="protoFtp">FTP</button>
            </div>
          </label>
        </div>
        <div class="row">
          <label><strong>Host</strong><input type="text" id="host" placeholder="sftp.example.com" /></label>
          <label><strong>Port</strong><input type="number" id="port" placeholder="22" /></label>
        </div>
        <div class="row">
          <label><strong>Username</strong><input type="text" id="username" /></label>
          <label id="secureWrap" class="checkbox-row hidden">
            <input type="checkbox" id="secure" checked />
            <strong>Use FTPS (TLS)</strong>
          </label>
          <label id="trustCertWrap" class="checkbox-row hidden">
            <input type="checkbox" id="trustServerCertificate" />
            <strong>Trust server certificate (skip TLS hostname check)</strong>
          </label>
        </div>
        <div class="row">
          <label>
            <strong>Remote path</strong>
            <input type="text" id="remotePath" value="/" />
          </label>
          <label>
            <strong>Local path</strong>
            <div class="input-with-btn">
              <input type="text" id="localPath" value="\${workspaceFolder}" />
              <button type="button" class="btn btn-ghost btn-sm" id="btnPickLocal">Browse</button>
            </div>
          </label>
        </div>
        <div id="sftpAuth" class="row full">
          <label>
            <strong>Private key (SFTP)</strong>
            <div class="input-with-btn">
              <input type="text" id="privateKeyPath" placeholder="~/.ssh/id_rsa (optional)" />
              <button type="button" class="btn btn-ghost btn-sm" id="btnPickKey">Browse</button>
            </div>
          </label>
        </div>
        <div id="sftpPassphrase" class="row full">
          <label><strong>Key passphrase</strong><input type="password" id="passphrase" autocomplete="off" /></label>
        </div>
        <div class="row full">
          <label>
            <strong>Password</strong>
            <div class="actions" style="margin-top:0;padding-top:0;border:0;">
              <button type="button" class="btn btn-secondary btn-sm" id="btnSetPassword">Set / change password</button>
              <button type="button" class="btn btn-ghost btn-sm" id="btnClearPassword">Clear password</button>
            </div>
            <p class="pw-status" id="pwStatus">Not stored in settings — kept in Cursor secret storage.</p>
          </label>
        </div>
        <div class="row full">
          <label>
            <strong>Sync ignore patterns</strong>
            <textarea id="ignore" placeholder="One glob per line"></textarea>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="btnSave">Save profile</button>
          <button type="button" class="btn btn-secondary" id="btnConnect">Connect</button>
          <button type="button" class="btn btn-danger" id="btnDelete">Delete</button>
        </div>
      </div>
    </section>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = { profiles: [], defaultProfile: '', uploadOnSave: false, passwordSet: {} };
    let selectedName = null;
    let isNew = true;
    let protocol = 'sftp';

    const $ = (id) => document.getElementById(id);

    function showToast(level, message) {
      const el = $('toast');
      el.textContent = message;
      el.className = 'toast ' + level;
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
    }

    function defaultPort(p) { return p === 'sftp' ? 22 : 21; }

    function setProtocol(p) {
      protocol = p;
      $('protoSftp').classList.toggle('active', p === 'sftp');
      $('protoFtp').classList.toggle('active', p === 'ftp');
      $('secureWrap').classList.toggle('hidden', p !== 'ftp');
      $('trustCertWrap').classList.toggle('hidden', p !== 'ftp');
      $('sftpAuth').classList.toggle('hidden', p !== 'sftp');
      $('sftpPassphrase').classList.toggle('hidden', p !== 'sftp');
      if (!$('port').value || $('port').value === String(defaultPort(p === 'sftp' ? 'ftp' : 'sftp'))) {
        $('port').placeholder = String(defaultPort(p));
      }
    }

    function profileFromForm() {
      const ignoreRaw = $('ignore').value.trim();
      const ignore = ignoreRaw
        ? ignoreRaw.split(/\\n/).map((s) => s.trim()).filter(Boolean)
        : ${JSON.stringify(DEFAULT_IGNORE_PATTERNS)};
      const portVal = $('port').value.trim();
      const profile = {
        name: $('name').value.trim(),
        protocol,
        host: $('host').value.trim(),
        username: $('username').value.trim(),
        remotePath: $('remotePath').value.trim() || '/',
        localPath: $('localPath').value.trim() || '\${workspaceFolder}',
        secure: $('secure').checked,
        trustServerCertificate: protocol === 'ftp' ? $('trustServerCertificate').checked : undefined,
        ignore,
      };
      if (portVal) profile.port = parseInt(portVal, 10);
      const key = $('privateKeyPath').value.trim();
      if (key) profile.privateKeyPath = key;
      const pass = $('passphrase').value;
      if (pass) profile.passphrase = pass;
      return profile;
    }

    function fillForm(p) {
      isNew = !p;
      $('formTitle').textContent = p ? 'Edit: ' + p.name : 'New profile';
      $('name').value = p?.name ?? '';
      $('host').value = p?.host ?? '';
      $('port').value = p?.port ?? '';
      $('port').placeholder = String(defaultPort(p?.protocol ?? protocol));
      $('username').value = p?.username ?? '';
      $('remotePath').value = p?.remotePath ?? '/';
      $('localPath').value = p?.localPath ?? '\${workspaceFolder}';
      $('privateKeyPath').value = p?.privateKeyPath ?? '';
      $('passphrase').value = p?.passphrase ?? '';
      $('secure').checked = p?.secure !== false;
      $('trustServerCertificate').checked = p?.trustServerCertificate === true;
      $('ignore').value = (p?.ignore ?? ${JSON.stringify(DEFAULT_IGNORE_PATTERNS)}).join('\\n');
      setProtocol(p?.protocol ?? 'sftp');
      selectedName = p?.name ?? null;
      updatePwStatus();
      renderList();
    }

    function updatePwStatus() {
      const name = $('name').value.trim();
      const el = $('pwStatus');
      if (name && state.passwordSet[name]) {
        el.textContent = 'Password stored securely for this profile.';
        el.classList.add('set');
      } else {
        el.textContent = 'No password stored. Use password auth or set one here.';
        el.classList.remove('set');
      }
    }

    function renderList() {
      const list = $('profileList');
      const empty = $('emptyList');
      list.innerHTML = '';
      if (!state.profiles.length) {
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');
      for (const p of state.profiles) {
        const li = document.createElement('li');
        li.className = 'profile-item' + (p.name === selectedName ? ' active' : '');
        li.innerHTML =
          '<span class="badge">' + p.protocol + '</span>' +
          '<div class="profile-meta"><strong>' + escapeHtml(p.name) + '</strong>' +
          '<span>' + escapeHtml(p.username + '@' + p.host) + '</span></div>';
        li.onclick = () => { selectedName = p.name; fillForm(p); };
        list.appendChild(li);
      }
      const sel = $('defaultProfile');
      const cur = sel.value;
      sel.innerHTML = '<option value="">— prompt when connecting —</option>';
      for (const p of state.profiles) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      }
      sel.value = state.defaultProfile || cur || '';
      $('uploadOnSave').checked = state.uploadOnSave;
    }

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    $('protoSftp').onclick = () => setProtocol('sftp');
    $('protoFtp').onclick = () => setProtocol('ftp');
    $('btnNew').onclick = () => { selectedName = null; fillForm(null); };
    $('btnSave').onclick = () => {
      const profile = profileFromForm();
      if (!profile.name || !profile.host || !profile.username) {
        showToast('error', 'Name, host, and username are required.');
        return;
      }
      vscode.postMessage({ type: 'saveProfile', profile, previousName: isNew ? undefined : selectedName });
    };
    $('btnDelete').onclick = () => {
      const name = $('name').value.trim();
      if (!name || isNew) return;
      if (confirm('Delete profile "' + name + '"?')) {
        vscode.postMessage({ type: 'deleteProfile', name });
        selectedName = null;
        fillForm(null);
      }
    };
    $('btnConnect').onclick = () => {
      const name = $('name').value.trim();
      if (name) vscode.postMessage({ type: 'connect', name });
    };
    $('btnSavePrefs').onclick = () => {
      vscode.postMessage({
        type: 'saveGeneral',
        defaultProfile: $('defaultProfile').value,
        uploadOnSave: $('uploadOnSave').checked,
      });
    };
    $('btnSetPassword').onclick = () => {
      const name = $('name').value.trim();
      if (!name) { showToast('error', 'Save profile name first.'); return; }
      vscode.postMessage({ type: 'setPassword', name });
    };
    $('btnClearPassword').onclick = () => {
      const name = $('name').value.trim();
      if (!name) return;
      vscode.postMessage({ type: 'clearPassword', name });
    };
    $('btnPickLocal').onclick = () => vscode.postMessage({ type: 'pickLocalFolder' });
    $('btnPickKey').onclick = () => vscode.postMessage({ type: 'pickPrivateKey' });
    $('name').oninput = updatePwStatus;

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'state') {
        state = msg;
        if (selectedName) {
          const p = state.profiles.find((x) => x.name === selectedName);
          if (p) fillForm(p);
          else if (!isNew) fillForm(null);
        }
        renderList();
        updatePwStatus();
      } else if (msg.type === 'pickedPath') {
        $(msg.field === 'localPath' ? 'localPath' : 'privateKeyPath').value = msg.path;
      } else if (msg.type === 'toast') {
        showToast(msg.level, msg.message);
      }
    });

    vscode.postMessage({ type: 'ready' });
    fillForm(null);
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
