import { JSDOM } from "jsdom";

/**
 * Merges annotated HTML tags from the original HTML into the validated IDL string.
 * Uses jsdom to safely extract text and preserve annotations.
 *
 * @param {string} originalHTML - The original HTML string containing annotated tags.
 * @param {string} validatedIDL - The validated IDL string to merge annotations into.
 * @returns {string} - The IDL string with HTML annotations merged in.
 */
export function mergeAnnotatedHTML(originalHTML, validatedIDL) {
  const dom = new JSDOM(originalHTML);
  const { document, NodeFilter } = dom.window;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null,
  );

  let result = validatedIDL;

  while (walker.nextNode()) {
    const el = /** @type {Element} */ (walker.currentNode);
    if (!el.textContent) continue;

    const innerText = el.textContent.trim();
    if (!innerText) continue;

    const idx = result.indexOf(innerText);
    if (idx !== -1) {
      result =
        result.slice(0, idx) +
        el.outerHTML +
        result.slice(idx + innerText.length);
    }
  }

  return result;
}
