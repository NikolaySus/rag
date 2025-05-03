/**
 * Splits an ANSI-colored string into chunks of maxVisibleLength,
 * preserving ANSI escape sequences and color formatting.
 *
 * @param {string} input - The input string (may contain ANSI codes)
 * @param {number} maxVisibleLength - The max visible length per chunk
 * @returns {string[]} - Array of ANSI-formatted string chunks
 */
function splitAnsiLineByVisibleLength(input, maxVisibleLength = 80) {
  // Regex to match ANSI escape sequences
  const ansiRegex = /\x1b\[[0-9;]*m/g;

  let result = [];
  let visibleCount = 0;
  let chunk = '';
  let match;
  let lastIndex = 0;

  // Find all ANSI codes and split accordingly
  while ((match = ansiRegex.exec(input)) !== null) {
    // Add visible chars before this ANSI code
    let before = input.slice(lastIndex, match.index);
    for (let i = 0; i < before.length; i++) {
      chunk += before[i];
      visibleCount++;
      if (visibleCount >= maxVisibleLength) {
        result.push(chunk);
        chunk = '';
        visibleCount = 0;
      }
    }
    // Add the ANSI code itself (doesn't count as visible)
    chunk += match[0];
    lastIndex = ansiRegex.lastIndex;
  }

  // Add any remaining visible chars after the last ANSI code
  let after = input.slice(lastIndex);
  for (let i = 0; i < after.length; i++) {
    chunk += after[i];
    visibleCount++;
    if (visibleCount >= maxVisibleLength) {
      result.push(chunk);
      chunk = '';
      visibleCount = 0;
    }
  }
  result.push(chunk);

  return result;
}

export default splitAnsiLineByVisibleLength;
