/**
 * This module gets GitHub raw source URL from spec URLs
 */

const fs = require("fs").promises;
const { JSDOM } = require("jsdom");
const fetch = require("node-fetch").default;
const { fetchText } = require("./utils.js");

/**
 * Should include `w3cApiKey` field for W3C API request
 */
const config = require("../config.json");

const specIdl = require("reffy/src/specs/specs-idl.json");
const specWhatwgIdl = require("reffy/src/specs/specs-whatwg-idl.json");
const specSources = require("../spec-sources.json");

const { completeWithShortName, completeWithInfoFromW3CApi } = require("reffy/src/lib/util.js");

/** @type {string[]} */
const urls = [
  ...specIdl,
  ...specWhatwgIdl
];

/**
 * @param {string} url
 */
async function checkIfExists(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (res.ok) {
    return url;
  }
}

async function guessIfEditLinkExists(url) {
  let { window } = new JSDOM(await fetchText(url));
  const sourceAnchor = window.document.querySelector("a[href$=\\.bs][href*=github]");
  if (!sourceAnchor) {
    return;
  }
  return {
    url: await checkIfExists(sourceAnchor.href)
  };
}

/**
 * @param {string} url
 */
async function guessForDraftsOrgSpecs(url) {
  const regex = /https:\/\/drafts\.([-\w]+)\.org\/([^/]+)\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, subOrgName, shortName] = match;
  const branchUrl = `https://github.com/w3c/${subOrgName}-drafts/blob/master`;
  const gitDir = `${branchUrl}/${shortName}/`;
  const guessed = await checkIfExists(gitDir + "Overview.bs") ||
    await checkIfExists(gitDir + "Overview.src.html");
  if (guessed) {
    return {
      shortName,
      url: guessed
    };
  }

  const withoutHyphen = shortName.replace(/-1$/, "");
  if (shortName !== withoutHyphen) {
    const gitDir = `${branchUrl}/${withoutHyphen}/`;
    return {
      shortName: withoutHyphen,
      url: await checkIfExists(gitDir + "Overview.bs") ||
        await checkIfExists(gitDir + "Overview.src.html")
    };
  }

  if (!shortName.endsWith("-1")) {
    const withHyphen = shortName + "-1";
    const gitDir = `${branchUrl}/${withHyphen}/`;
    return {
      shortName: withHyphen,
      url: await checkIfExists(gitDir + "Overview.bs") ||
        await checkIfExists(gitDir + "Overview.src.html")
    };
  }
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
  return {
    shortName,
    url: await checkIfExists(gitDir + "index.bs") ||
      await checkIfExists(gitDir + `${shortName}.bs`) ||
      await checkIfExists(gitDir + "source") ||
      await checkIfExists(gitDir + `compatibility.bs`)
  };
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
  return {
    shortName,
    url: await checkIfExists(rawgit)
  };
}

/**
 * @param {string} url
 */
async function guessForCDN(url) {
  const list = [
    "https://cdn.staticaly.com/gh/",
    "https://rawgit.com/"
  ];
  let path;
  for (const cdn of list) {
    if (url.startsWith(cdn)) {
      path = url.slice(cdn.length);
      break;
    }
  }

  if (!path) {
    return;
  }
  const [, orgName, shortName, subpath] = path.match(/^(\w+)\/([-\w]+)\/(.+)/);
  const filePath = subpath.endsWith("/") ? (subpath + "index.html") : subpath;

  const rawgit = `https://github.com/${orgName}/${shortName}/blob/${filePath}`;
  return {
    shortName,
    url: await checkIfExists(rawgit)
  };
}

/**
 * @param {string} url
 */
async function guessForW3CTR(url) {
  const regex = /https:\/\/www\.w3\.org\/TR\/([^/]+)\//;
  const match = url.match(regex);
  if (!match) {
    return;
  }

  const [, shortName] = match;
  const rawgit = `https://github.com/w3c/${shortName}/blob/gh-pages/index.html`;
  return {
    shortName,
    url: await checkIfExists(rawgit)
  };
}

/**
 * @param {string} url
 */
async function guessForGeneralGitHubSpecs(url) {
  const regex = /https?:\/\/([-\w]+)\.github\.io\/([^/]+)\/(.*)/;
  const match = url.match(regex);
  if (!match) {
    return;
  }
  const [, orgName, shortName, path] = match;
  const repoUrl = `https://github.com/${orgName}/${shortName}/blob`;
  const masterBranch = `${repoUrl}/master/`;
  const ghPagesBranch = `${repoUrl}/gh-pages/`;
  if (path) {
    const filePath = path.endsWith("/") ? path + "index.html" : path;
    return {
      shortName: `${shortName}-${filePath.replace(/\//g, "-",).replace(".html", "")}`,
      url: await checkIfExists(masterBranch + filePath) ||
        await checkIfExists(ghPagesBranch + filePath)
    };
  }

  // Used by paint-timing
  const customName = shortName.toLowerCase().replace(/-/g, "") + ".bs";
  return {
    shortName,
    url: await checkIfExists(masterBranch + "index.bs") ||
      await checkIfExists(masterBranch + "Overview.bs") ||
      await checkIfExists(masterBranch + customName) ||
      await checkIfExists(masterBranch + "index.src.html") ||
      await checkIfExists(masterBranch + "index.html") ||
      await checkIfExists(ghPagesBranch + "index.bs") ||
      await checkIfExists(ghPagesBranch + "index.html") ||
      await checkIfExists(masterBranch + "spec/index.bs") ||
      await checkIfExists(masterBranch + "spec/index.html")
  };
}

async function detectURLAndShortName(url) {
  const guessed = await guessForDraftsOrgSpecs(url) ||
    await guessForWHATWGSpecs(url) ||
    await guessForKhronosSpecs(url) ||
    await guessForGeneralGitHubSpecs(url) ||
    await guessForCDN(url) ||
    await guessForW3CTR(url);
  if (!guessed || !guessed.url) {
    return await guessIfEditLinkExists(url);
  }
  return guessed;
}

function convertToRawgit(url) {
  if (!url) {
    return null;
  }
  const rawgit = url.replace("github.com", "raw.githubusercontent.com");
  return rawgit.replace("/blob/", "/").replace("/commits/", "/");
}

async function addMissingSpecSources(specInfoList) {
  for (const { edDraft, url, shortname } of specInfoList) {
    const item = specSources[url] || {};
    if (!item || !item.source || !item.shortName) {
      const latestPublishedUrl = edDraft || url;
      const detected = await detectURLAndShortName(latestPublishedUrl);
      item.shortName =
        shortname ? shortname :
        detected ? detected.shortName :
        null;
      item.url = latestPublishedUrl;
      item.source = detected ? detected.url : null;
      item.rawSource = detected ? convertToRawgit(detected.url) : null;
      specSources[url] = item;
    }
  }
}

async function getSpecInfo(url) {
  const specObject = completeWithShortName({ url });
  return await completeWithInfoFromW3CApi(specObject, config.w3cApiKey);
}

async function tryReadSpecInfoList() {
  try {
    return require("../spec-info.json");
  } catch {
    const specinfo = await Promise.all(urls.map(getSpecInfo))
    await fs.writeFile("spec-info.json", JSON.stringify(specinfo, null, 2) + "\n");
    return specinfo;
  }
}

(async () => {
  const specInfoList = await tryReadSpecInfoList();

  await addMissingSpecSources(specInfoList);

  await fs.writeFile("spec-sources.json", JSON.stringify(specSources, null, 2) + "\n");
})().catch(e => {
  process.on("exit", () => {
    console.error(e);
  });
  process.exit(1);
})
