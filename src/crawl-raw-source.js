/**
 * This module gets GitHub raw source URL from spec URLs
 */

const fs = require("fs").promises;
const { parse: parsePath } = require("path");
const specs = require("browser-specs");
const { Octokit } = require("@octokit/rest");

const config = require("../config.json");
const octokit = new Octokit({ auth: config.botAuth });


function exists(array, ...items) {
  for (const item of items) {
    if (array.includes(item)) {
      return item;
    }
  }
}

/**
 * For csswg.org and css-houdini.org
 * @param {string[]} paths
 */
function guessForDraftsOrgSpecs(paths, specInfo) {
  const regex = /https:\/\/drafts\.[-\w]+\.org\/([^/]+)\//;
  const match = specInfo.nightly.url.match(regex);
  if (!match) {
    return;
  }

  const candidates = new Set([specInfo.shortname, specInfo.series.shortname]);
  candidates.add(match[1]); // e.g. CSS2
  if (!match[1].endsWith("-1")) {
    candidates.add(match[1] + "-1"); // e.g. css-style-attr
  }
  for (const shortname of candidates) {
    const guessed = exists(paths, `${shortname}/Overview.bs`, `${shortname}/Overview.src.html`);
    if (guessed) {
      return guessed;
    }
  }
  throw new Error([...candidates]);
}

/**
 * @param {string[]} paths
 */
function guessForWHATWGSpecs(paths, specInfo) {
  const { url } = specInfo.nightly;
  const regex = /https:\/\/(\w+)\.spec\.whatwg\.org\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, shortName] = match;
  return exists(paths, "index.bs", `${shortName}.bs`, "source", `compatibility.bs`);
}

/**
 * @param {string[]} paths
 */
function guessForKhronosSpecs(paths, specInfo) {
  const { url } = specInfo.nightly;
  // https://www.khronos.org/registry/webgl/
  const regex = /https:\/\/www\.khronos\.org\/registry\/webgl\/(.+)\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, dir] = match;
  return exists(paths, `${dir}/index.html`, `${dir}/extension.xml`);
}

function guessForGeneralGitHubSpecs(paths, specInfo) {
  const { url } = specInfo.nightly;
  const regex = /https?:\/\/[-\w]+\.github\.io\/[^/]+\/(.*)/;
  const match = url.match(regex);
  if (!match) {
    return;
  }
  const [, path] = match;
  if (path) {
    if (path.endsWith("/")) {
      return exists(
        paths,
        `document/core/index.bs`, // WebAssembly
        path + "index.bs",
        "spec/index.bs", // trusted-types
        path + "index.html",
      );
    }

    const name = parsePath(path).name;
    return exists(
      paths,
      `${name}.bs`, // text-detection-api
      path
    );
  }

  const { shortname } = specInfo;

  // too special
  const specials = {
    "layers": "webxrlayers-1.bs",
    "mediastream-recording": "MediaRecorder.bs"
  }
  if (specials[shortname]) {
    return exists(paths, specials[shortname]);
  }

  // Used by paint-timing
  const customName = shortname.toLowerCase().replace(/-/g, "") + ".bs";
  return exists(
    paths,
    "index.bs",
    "spec/index.bs", // gpuweb
    `${shortname}.bs`, // storage-access
    "docs/index.bs", // service-workers
    "Overview.bs",
    "spec.bs", // page-lifecycle
    "spec/Overview.html", // webcrypto
    customName,
    shortname + "-respec.html", // encrypted-media, media-source
    "index.src.html",
    "index.html",
    "spec/index.html"
  );
}

async function detectURLAndShortName(specInfo) {
  const url = specInfo.nightly.url;
  console.log(`${url} ...`)
  const { owner, repo } = getGitHubInfo(specInfo.nightly.repository);
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: "HEAD", recursive: true });
  const paths = data.tree.map(entry => entry.path);

  const guessed = guessForDraftsOrgSpecs(paths, specInfo) ||
    guessForWHATWGSpecs(paths, specInfo) ||
    guessForKhronosSpecs(paths, specInfo) ||
    guessForGeneralGitHubSpecs(paths, specInfo);
  if (!guessed) {
    console.warn("Couldn't guess the source path");
    return;
  }
  const fullUrl = `https://github.com/${owner}/${repo}/blob/HEAD/${guessed}`;
  console.log(`-> ${fullUrl}`);
  return fullUrl;
}

function getGitHubInfo(url) {
  const regex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/blob\/([^/]+)\/(.+))?$/;
  const match = url.match(regex);
  if (!match) {
    throw new Error("No way!! " + url);
  }
  const [, owner, repo,, path] = match;
  return { owner, repo, path };
}

async function addMissingSpecSources() {
  // This needs to be sequential as requesting everything in once causes
  // HTTP 429 too many requests error.
  const specSources = {};
  for (const specInfo of specs) {
    if (specInfo.shortname !== specInfo.series.currentSpecification) {
      // Cannot take care of old snapshots
      continue;
    }
    const { url } = specInfo.nightly;
    const item = specSources[url] = {};
    const detected = await detectURLAndShortName(specInfo);
    item.shortName = specInfo.shortname;
    item.url = url;
    item.source = detected || null;
    if (detected?.includes("github.com")) {
      item.github = getGitHubInfo(detected);
    } else {
      item.github = null;
    }
  }
  return specSources;
}

(async () => {
  const specSources = await addMissingSpecSources();

  await fs.writeFile("spec-sources.browsers.generated.json", JSON.stringify(specSources, null, 2) + "\n");
})().catch(e => {
  process.on("exit", () => {
    console.error(e);
  });
  process.exit(1);
})
