import { createRequire } from "module";

const require = createRequire(import.meta.url);

const browserSpecs = require("browser-specs");
const manualSources = require("../../spec-sources.manual.json");

/**
 * @param {string} url
 */
function getGitHubInfo(url) {
  const regex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/blob\/([^/]+)\/(.+))?$/;
  const match = url.match(regex);
  if (!match) {
    throw new Error("No way!! " + url);
  }
  const [, owner, repo, , path] = match;
  return { owner, repo, path };
}

/**
 * @type {Record<string, SpecSource>}
 *
 * @typedef {object} SpecSource
 * @property {string} shortName
 * @property {string} url
 * @property {string} source
 * @property {ReturnType<typeof getGitHubInfo>} github
 */
let exports;
if (process.env.WEBIDL_UPDATER_TEST) {
  exports = {
    "https://raw.githubusercontent.com/saschanaz/test-spec/master/index.html": {
      shortName: "test-spec",
      url:
        "https://raw.githubusercontent.com/saschanaz/test-spec/master/index.html",
      source: "https://github.com/saschanaz/test-spec/blob/HEAD/index.html",
      github: {
        owner: "saschanaz",
        repo: "test-spec",
        path: "index.html",
      },
    },
  };
} else {
  const browserSources = {};
  for (const spec of browserSpecs) {
    const { nightly } = spec;
    const source = `${nightly.repository}/blob/HEAD/${nightly.sourcePath}`;
    browserSources[nightly.url] = {
      shortName: spec.shortname,
      url: nightly.url,
      source,
      github: getGitHubInfo(source),
    };
  }
  exports = { ...browserSources, ...manualSources };
}

export default exports;
