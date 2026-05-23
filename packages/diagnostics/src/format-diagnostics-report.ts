import type { PlatformCapabilities } from '@app/platform';

import type { DiagnosticsReport } from './types.js';

export function formatStorageBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) {
    return 'unknown';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatCapabilityFlags(capabilities: PlatformCapabilities): string[] {
  const { runtime: _runtime, ...flags } = capabilities;
  return Object.entries(flags)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, enabled]) => `${key}: ${enabled ? 'yes' : 'no'}`);
}

export function formatDiagnosticsReport(report: DiagnosticsReport): string {
  const lines: string[] = [
    `${report.appName} diagnostics`,
    `generatedAt: ${report.generatedAt}`,
    `appVersion: ${report.appVersion}`,
    `runtime: ${report.runtime}`,
    '',
    'Platform',
  ];

  const snapshotEntries = Object.entries(report.platformSnapshot).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  if (snapshotEntries.length === 0) {
    lines.push('  (no platform snapshot fields)');
  } else {
    for (const [key, value] of snapshotEntries) {
      if (typeof value === 'object') {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }

  lines.push('', 'Capabilities');
  for (const line of formatCapabilityFlags(report.capabilities)) {
    lines.push(`  ${line}`);
  }

  lines.push('', 'Storage');
  if (report.storageEstimate === null) {
    lines.push('  unavailable');
  } else {
    lines.push(`  quota: ${formatStorageBytes(report.storageEstimate.quota)}`);
    lines.push(`  usage: ${formatStorageBytes(report.storageEstimate.usage)}`);
    lines.push(`  persisted: ${report.storageEstimate.persisted === true ? 'yes' : 'no'}`);
  }

  lines.push('', 'Local database');
  lines.push(`  ready: ${report.localDatabaseReady ? 'yes' : 'no'}`);
  if (report.localData !== null) {
    lines.push(`  libraryEntries: ${report.localData.libraryEntryCount}`);
    lines.push(`  mangaIdentities: ${report.localData.mangaIdentityCount}`);
    lines.push(`  installedExtensions: ${report.localData.installedExtensionCount}`);
    lines.push(`  enabledExtensions: ${report.localData.enabledExtensionCount}`);
    lines.push(`  brokenExtensions: ${report.localData.brokenExtensionCount}`);
    lines.push(`  categories: ${report.localData.categoryCount}`);
    lines.push(`  providerSettings: ${report.localData.providerSettingsCount}`);
  }

  if (report.localService !== null) {
    lines.push('', 'Local service');
    lines.push(`  running: ${report.localService.running ? 'yes' : 'no'}`);
    lines.push(`  host: ${report.localService.host ?? 'n/a'}`);
    lines.push(`  port: ${report.localService.port ?? 'n/a'}`);
  }

  return lines.join('\n');
}
