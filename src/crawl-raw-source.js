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
  const rawgit = sourceAnchor.href.replace("github.com", "raw.githubusercontent.com");
  return {
    url: await checkIfExists(rawgit.replace("/blob/", "/").replace("/commits/", "/"))
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
  const branchUrl = `https://raw.githubusercontent.com/w3c/${subOrgName}-drafts/master`;
  const rawgitDir = `${branchUrl}/${shortName}/`;
  const guessed = await checkIfExists(rawgitDir + "Overview.bs") ||
    await checkIfExists(rawgitDir + "Overview.src.html");
  if (guessed) {
    return {
      shortName,
      url: guessed
    };
  }

  const withoutHyphen = shortName.replace(/-1$/, "");
  if (shortName !== withoutHyphen) {
    const rawgitDir = `${branchUrl}/${withoutHyphen}/`;
    return {
      shortName: withoutHyphen,
      url: await checkIfExists(rawgitDir + "Overview.bs") ||
        await checkIfExists(rawgitDir + "Overview.src.html")
    };
  }

  if (!shortName.endsWith("-1")) {
    const withHyphen = shortName + "-1";
    const rawgitDir = `${branchUrl}/${withHyphen}/`;
    return {
      shortName: withHyphen,
      url: await checkIfExists(rawgitDir + "Overview.bs") ||
        await checkIfExists(rawgitDir + "Overview.src.html")
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
  const rawgitDir = `https://raw.githubusercontent.com/whatwg/${shortName}/master/`;
  return {
    shortName,
    url: await checkIfExists(rawgitDir + "index.bs") ||
      await checkIfExists(rawgitDir + `${shortName}.bs`) ||
      await checkIfExists(rawgitDir + "source") ||
      await checkIfExists(rawgitDir + `compatibility.bs`)
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
  const rawgit = `https://raw.githubusercontent.com/KhronosGroup/${shortName}/master/${path}/index.html`;
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
  const shortName = path.match(/^\w+\/(\w+)/)[1];
  if (path.endsWith("/")) {
    path += "index.html";
  }

  const rawgit = `https://raw.githubusercontent.com/${path}`;
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
  const rawgit = `https://raw.githubusercontent.com/w3c/${shortName}/gh-pages/index.html`;
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
  const repoUrl = `https://raw.githubusercontent.com/${orgName}/${shortName}`;
  const masterBranch = `${repoUrl}/master/`;
  const ghPagesBranch = `${repoUrl}/gh-pages/`;
  if (path) {
    return {
      shortName: `${shortName}-${path.replace(".html", "")}`,
      url: await checkIfExists(masterBranch + path) ||
        await checkIfExists(ghPagesBranch + path)
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
  return await guessForDraftsOrgSpecs(url) ||
    await guessForWHATWGSpecs(url) ||
    await guessForKhronosSpecs(url) ||
    await guessForGeneralGitHubSpecs(url) ||
    await guessForCDN(url) ||
    await guessForW3CTR(url) ||
    await guessIfEditLinkExists(url);
}

async function addMissingSpecSources(specInfoList) {
  for (const { edDraft, url, shortName } of specInfoList) {
    const item = specSources[url] || {};
    if (!item || !item.rawUrl || !item.shortName) {
      const latestPublishedUrl = edDraft || url;
      const detected = await detectURLAndShortName(latestPublishedUrl);
      item.shortName =
        shortName ? shortName :
        detected ? detected.shortName :
        null;
      item.url = latestPublishedUrl;
      item.rawUrl = detected ? detected.url : null;
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
