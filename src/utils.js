const fetch = require("node-fetch").default;

/**
 * @param {string} url
 */
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Network error ${res.statusText}: ${res.url}`);
  }
  return await res.text();
}
module.exports.fetchText = fetchText;
