/**
 * This module gets GitHub raw source URL from spec URLs
 */

const fs = require("fs").promises;
const { parse: parsePath } = require("path");
const { JSDOM } = require("jsdom");
const fetch = require("node-fetch").default;
const { fetchText } = require("./utils.js");

const specUrls = require("browser-specs");

function until(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 */
async function checkIfExists(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (res.ok) {
    return res.url; // can be redirected
  } else if (res.status === 429) {
    console.log(`Got HTTP 429 TOO MANY REQUESTS, waiting for 5 seconds to try again...`);
    await until(5000);
    return await checkIfExists(url);
  } if (res.status !== 404) {
    console.error(`${res.url} threw ${res.status} ${res.statusText}`)
  }
}

async function guessIfEditLinkExists(url) {
  let { window } = new JSDOM(await fetchText(url));
  const sourceAnchor = window.document.querySelector("a[href$=\\.bs][href*=github]");
  if (!sourceAnchor) {
    return;
  }
  return await checkIfExists(sourceAnchor.href);
}

async function guessForDraftsOrgSpecs(specInfo) {
  const regex = /https:\/\/drafts\.[-\w]+\.org\/([^/]+)\//;
  const match = specInfo.nightly.url.match(regex);
  if (!match) {
    return;
  }

  const branchUrl = `${specInfo.nightly.repository}/blob/master`;
  const candidates = new Set([specInfo.shortname, specInfo.series.shortname]);
  candidates.add(match[1]); // e.g. CSS2
  if (!match[1].endsWith("-1")) {
    candidates.add(match[1] + "-1"); // e.g. css-style-attr
  }
  for (const shortname of candidates) {
    const gitDir = `${branchUrl}/${shortname}/`;
    const guessed = await checkIfExists(gitDir + "Overview.bs") ||
      await checkIfExists(gitDir + "Overview.src.html");
    if (guessed) {
      return guessed;
    }
  }
  throw new Error([...candidates]);
}

/**
 * @param {string} url
 */
async function guessForWHATWGSpecs(url) {
  const regex = /https:\/\/(\w+)\.spec\.whatwg\.org\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, shortName] = match;
  const gitDir = `https://github.com/whatwg/${shortName}/blob/master/`;
  return await checkIfExists(gitDir + "index.bs") ||
    await checkIfExists(gitDir + `${shortName}.bs`) ||
    await checkIfExists(gitDir + "source") ||
    await checkIfExists(gitDir + `compatibility.bs`);
}

/**
 * @param {string} url
 */
async function guessForKhronosSpecs(url) {
  // https://www.khronos.org/registry/
  const regex = /https:\/\/www\.khronos\.org\/registry\/(\w+)\/(.+)\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, shortName, path] = match;
  const rawgit = `https://github.com/KhronosGroup/${shortName}/blob/master/${path}/index.html`;
  return await checkIfExists(rawgit);
}

async function guessForGeneralGitHubSpecs(specInfo) {
  const { url } = specInfo.nightly;
  const regex = /https?:\/\/([-\w]+)\.github\.io\/([^/]+)\/(.*)/;
  const match = url.match(regex);
  if (!match) {
    return;
  }
  const [,, shortName, path] = match;
  const repoUrl = `${specInfo.nightly.repository}/blob`;
  const mainBranch = `${repoUrl}/main/`;
  const masterBranch = `${repoUrl}/master/`;
  const ghPagesBranch = `${repoUrl}/gh-pages/`;
  if (path) {
    if (path.endsWith("/")) {
      return await checkIfExists(masterBranch + "document/" + path + "index.bs") || // WebAssembly
        await checkIfExists(masterBranch + path + "index.bs") ||
        await checkIfExists(masterBranch + "spec/index.bs") || // trusted-types
        await checkIfExists(masterBranch + path + "index.html") ||
        await checkIfExists(ghPagesBranch + path + "index.bs") ||
        await checkIfExists(ghPagesBranch + path + "index.html");
    }

    const name = parsePath(path).name;
    return await checkIfExists(masterBranch + `${name}.bs`) || // text-detection-api
      await checkIfExists(masterBranch + path) ||
      await checkIfExists(ghPagesBranch + path);
  }

  if (shortName === "layers") {
    // too special
    return await checkIfExists(masterBranch + "webxrlayers-1.bs");
  }

  // Used by paint-timing
  const customName = shortName.toLowerCase().replace(/-/g, "") + ".bs";
  return await checkIfExists(mainBranch + "index.bs") ||
    await checkIfExists(mainBranch + "spec/index.bs") || // gpuweb
    await checkIfExists(mainBranch + `${shortName}.bs`) || // storage-access
    await checkIfExists(masterBranch + "index.bs") ||
    await checkIfExists(masterBranch + "docs/index.bs") || // service-workers
    await checkIfExists(masterBranch + "Overview.bs") ||
    await checkIfExists(masterBranch + "spec.bs") || // page-lifecycle
    await checkIfExists(masterBranch + customName) ||
    await checkIfExists(masterBranch + shortName + "-respec.html") || // encrypted-media
    await checkIfExists(masterBranch + "index.src.html") ||
    await checkIfExists(masterBranch + "index.html") ||
    await checkIfExists(ghPagesBranch + shortName + "-respec.html") || // media-source
    await checkIfExists(ghPagesBranch + "index.bs") ||
    await checkIfExists(ghPagesBranch + "index.html") ||
    await checkIfExists(masterBranch + "spec/index.bs") ||
    await checkIfExists(masterBranch + "spec/index.html");
}

async function detectURLAndShortName(specInfo) {
  const url = specInfo.nightly.url;
  console.log(`${url} ...`)
  const guessed = await guessForDraftsOrgSpecs(specInfo) ||
    await guessForWHATWGSpecs(url) ||
    await guessForKhronosSpecs(url) ||
    await guessForGeneralGitHubSpecs(specInfo);
  if (!guessed) {
    console.warn("Couldn't guess the source path, parsing the page to find one");
    return await guessIfEditLinkExists(url);
  } else {
    console.log(`-> ${guessed}`);
  }
  return guessed;
}

function getGitHubInfo(url) {
  const regex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/;
  const match = url.match(regex);
  if (!match) {
    throw new Error("No way!!");
  }
  const [, owner, repo, branch, path] = match;
  return { owner, repo, branch, path };
}

async function addMissingSpecSources(specInfoList) {
  // This needs to be sequential as requesting everything in once causes
  // HTTP 429 too many requests error.
  const specSources = {};
  for (const specInfo of specInfoList) {
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
  const specSources = await addMissingSpecSources(specUrls);

  await fs.writeFile("spec-sources.browsers.generated.json", JSON.stringify(specSources, null, 2) + "\n");
})().catch(e => {
  process.on("exit", () => {
    console.error(e);
  });
  process.exit(1);
})
