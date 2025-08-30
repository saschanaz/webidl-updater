/**
 * Merges annotated HTML tags from the original HTML into the validated IDL string.
 * This function attempts to preserve HTML annotations by replacing matching inner text
 * in the validatedIDL with the corresponding HTML-tagged content from originalHTML.
 *
 * @param {string} originalHTML - The original HTML string containing annotated tags.
 * @param {string} validatedIDL - The validated IDL string to merge annotations into.
 * @returns {string} - The IDL string with HTML annotations merged in.
 */
export function mergeAnnotatedHTML(originalHTML, validatedIDL) {
  // Match HTML tags and their content in originalHTML
  const htmlMatches = originalHTML.match(/<[^>]+>.*?<\/[^>]+>/g);

  // If no HTML tags are found, return the validatedIDL as it is
  if (!htmlMatches) return validatedIDL;

  /**
   * Escapes special characters in a string for use in a regular expression.
   * @param {string} str - The string to escape.
   * @returns {string} - The escaped string safe for use in RegExp.
   */
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  let result = validatedIDL;

  // Replace each match in order, one occurrence at a time
  for (const htmlMatch of htmlMatches) {
    const innerText = htmlMatch.replace(/<\/?[^>]+>/g, "").trim();
    if (!innerText) continue;

    const safeInner = escapeRegExp(innerText);

    // Replace only the first occurrence to avoid over-replacing duplicates
    result = result.replace(new RegExp(safeInner), htmlMatch);
  }

  return result;
}
