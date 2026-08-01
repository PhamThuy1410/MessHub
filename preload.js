const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'set-browserview-visibility',
  'switch-profile',
  'open-download',
  'show-download-in-folder',
  'remove-download',
  'delete-profile',
  'update-profile-settings',
  'go-back-page',
  'reload-page',
  'check-for-updates',
  'download-update',
  'install-update',
  'set-lock-password',
  'unlock-app',
  'lock-app',
  'renderer-ready',
  'get-downloads',
]);

const SYNC_CHANNELS = new Set([
  'workspace-get-state',
  'workspace-save-data',
  'workspace-create',
  'workspace-switch',
  'get-settings',
]);

const RECEIVE_CHANNELS = new Set([
  'downloads-list',
  'download-updated',
  'update-state',
  'lock-state',
  'unlock-result',
  'update-profile-badge',
  'update-profile-info',
]);

function assertAllowed(channel, allowedChannels) {
  if (!allowedChannels.has(channel)) {
    throw new Error(`IPC channel không được phép: ${channel}`);
  }
}

contextBridge.exposeInMainWorld('messHubIPC', {
  send(channel, ...args) {
    assertAllowed(channel, SEND_CHANNELS);
    ipcRenderer.send(channel, ...args);
  },

  sendSync(channel, ...args) {
    assertAllowed(channel, SYNC_CHANNELS);
    return ipcRenderer.sendSync(channel, ...args);
  },

  on(channel, callback) {
    assertAllowed(channel, RECEIVE_CHANNELS);
    if (typeof callback !== 'function') {
      throw new TypeError('IPC listener phải là một hàm.');
    }

    const listener = (_event, ...args) => callback(undefined, ...args);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  },
});