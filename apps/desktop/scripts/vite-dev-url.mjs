/** @param {string} text */
export function parseViteLocalUrl(text) {
  const match = text.match(/Local:\s+(https?:\/\/[^\s]+)/i);
  if (!match) return null;
  return match[1].replace(/\/$/, '');
}

/** @param {string} text */
export function parsePortInUseMessage(text) {
  const match = text.match(/Port (\d+) is in use/i);
  return match ? Number(match[1]) : null;
}
