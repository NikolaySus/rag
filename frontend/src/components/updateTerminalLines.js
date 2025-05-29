/**
 * Updates terminal lines with new output, handling carriage returns and newlines.
 * @param {string[]} lines - Current terminal lines.
 * @param {string} output - New output string.
 * @returns {string[]} Updated lines array.
 */
export function updateTerminalLines(lines, output) {
  let updatedLines = [...lines];

  // Emulate carriage return: overwrite the last line
  if (output.startsWith('\r')) {
    output = output.replace(/^\r/, '');
    if (updatedLines.length === 0) {
      updatedLines.push(output);
    } else {
      updatedLines.pop();
      updatedLines.push(output);
    }
  } else {
    // Check if the last line ends with a newline character
    const lastLineEndsWithNewline =
      updatedLines.length > 0 && updatedLines[updatedLines.length - 1].endsWith('\n');
    const splitLines = output.split('\n');
    splitLines.forEach((line, idx) => {
      if (idx === 0 && updatedLines.length > 0 && !lastLineEndsWithNewline) {
        // Append to the last line if it doesn't end with a newline
        updatedLines[updatedLines.length - 1] += line;
      } else {
        updatedLines.push(line);
      }
    });
  }
  // Limit terminal buffer size (optional, e.g., 500 lines)
  if (updatedLines.length > 500) updatedLines = updatedLines.slice(updatedLines.length - 500);

  return updatedLines;
}
