import fetch from "node-fetch";

/**
 * @param {string} url
 */
export default async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Network error ${res.statusText}: ${res.url}`);
  }
  return await res.text();
}
