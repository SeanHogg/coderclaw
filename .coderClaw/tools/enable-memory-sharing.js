#!/usr/bin/env node
/**
 * enable-memory-sharing.js
 *
 * Opt-in to share memory suggestions with other CoderClaw instances in the same tenant.
 * This sets up a local sync directory and configures periodic push of index hash peers.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const syncDir = path.join(rootDir, '.coderclaw', 'memory-sync');
const configPath = path.join(syncDir, 'config.yaml');

function enableSharing() {
  if (fs.existsSync(configPath)) {
    console.log('✓ Memory sharing already enabled');
    return;
  }

  ensureDir(syncDir);

  const config = `enabled: true
sync:
  mode: push
  intervalMs: 86400000  # daily, same as suggestion scan
  peers: []  # filled via claw_fleet discovery
conflictResolution: merge-preference-local
privacy:
  privateEntries: true  # never share entries tagged #private
`;
  fs.writeFileSync(configPath, config);
  console.log(`✅ Memory sharing enabled. Config written to ${configPath}`);
  console.log('   Peer discovery will populate peers list automatically.');
}

ensureDir(syncDir);
enableSharing();
