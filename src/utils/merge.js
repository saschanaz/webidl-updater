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

  // Iterate over each match and replace corresponding parts in validatedIDL
  htmlMatches.forEach((htmlMatch) => {
    // Extract the text between the HTML tags (just for the sake of matching it in validatedIDL)
    const innerText = htmlMatch.replace(/<\/?[^>]+>/g, "");

    // Replace any matching innerText in validatedIDL with the full HTML tag
    validatedIDL = validatedIDL.replace(
      new RegExp(`(${innerText})`, "g"),
      htmlMatch,
    );
  });

  return validatedIDL;
}
