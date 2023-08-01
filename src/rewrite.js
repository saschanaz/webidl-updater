import { promises as fs } from "fs";
import * as webidl2 from "webidl2";
import { createPatch } from "diff";
import { JSDOM } from "jsdom";
import fetchText from "./utils/fetch-text.js";
import { similarReplace } from "./utils/similar-replace.js";

import extract from "./utils/extract-webidl.js";

import specRawSources from "./utils/spec-sources.js";

function getRawGit(githubInfo) {
  if (!githubInfo) {
    return null;
  }
  const { owner, repo, path } = githubInfo;
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
}

/**
 * Loading everything in once tends to break, thus do it one by one
 * @param {*[]} specSourceList
 */
async function extractOneByOne(specSourceList) {
  const results = new Map();
  const fetchedList = await Promise.all(
    specSourceList.map(async (item) => {
      const destination = getRawGit(item.github) || item.url;
      const text = await fetchText(getRawGit(item.github) || item.url).catch(
        () => {
          console.warn(`Failed to fetch ${destination}, skipping.`);
          return "";
        },
      );
      return {
        shortName: item.shortName,
        text,
        sourceUrl: item.source,
      };
    }),
  );
  for (const { shortName, text, sourceUrl } of fetchedList) {
    results.set(shortName, {
      ...(await extract(JSDOM.fragment(text))),
      text,
      shortName,
      sourceUrl,
    });
  }
  return results;
}

function mapToArray(object) {
  const result = [];
  for (const [, value] of Object.entries(object)) {
    result.push(value);
  }
  return result;
}

/**
 * @param {string} detector if this escapes, then escape the target in the same way
 * @param {string} target string to escape
 */
function conditionalBracketEscape(detector, target) {
  if (detector.includes("&lt;")) {
    target = target.replace(/</g, "&lt;");
  }
  if (detector.includes("&gt;")) {
    target = target.replace(/>/g, "&gt;");
  }
  return target;
}

/** @param {Element[]} blocks */
function blocksIncludeHTML(blocks) {
  return blocks.some((block) => !!block.children.length);
}

function replaceBlocksInSpec(spec, targetSpecItem) {
  const diffs = [];
  for (const [blockIndex, block] of Object.entries(spec)) {
    const originalIdl = targetSpecItem.idl[blockIndex];
    const rewritten = webidl2.write(block);
    if (originalIdl !== rewritten) {
      const { innerHTML } = targetSpecItem.blocks[blockIndex];
      diffs.push([innerHTML, rewritten]);
    }
  }
  return diffs;
}

function getTargetSpecs() {
  const specSourceList = mapToArray(specRawSources);

  const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  if (filter.length) {
    console.log(`Rewriting ${filter}...`);
    return specSourceList.filter((s) => filter.includes(s.shortName));
  }
  console.log("Rewriting all specs...");
  return specSourceList;
}

function tryParse(extracts) {
  const astMap = new Map();
  const errorMap = new Map();
  for (const [title, extract] of extracts) {
    try {
      astMap.set(
        title,
        extract.idl.map((idl, i) =>
          webidl2.parse(idl, {
            concrete: true,
            sourceName: [extract.shortName, i],
          }),
        ),
      );
    } catch (err) {
      astMap.set(title, []);
      if (err.context) {
        errorMap.set(title, err);
      } else {
        throw err;
      }
    }
  }
  return { astMap, errorMap };
}

/**
 * @param {string} path
 * @param {*} data
 */
function writeAsJson(path, data) {
  return fs.writeFile(path, JSON.stringify(data, null, 2));
}

const ignoredValidations = [
  "no-duplicate", // Hard to find which spec should be warned about this
  "no-cross-overload", // Same as above
];

function filterValidation(v, results) {
  if (ignoredValidations.includes(v.ruleName)) {
    console.warn(
      `Ignoring validation "${v.ruleName}" from ${v.sourceName[0]}. Details:\n${v.message}`,
    );
    return false;
  }
  const { sourceUrl } = results.get(v.sourceName[0]);
  if (sourceUrl.includes("WebGL") && v.ruleName === "no-nointerfaceobject") {
    // WebGL has no intent to remove [LegacyNoInterfaceObject] for now
    // https://github.com/KhronosGroup/WebGL/issues/2504#issuecomment-410823542
    console.warn(
      `Ignoring LegacyNoInterfaceObject from a WebGL spec: ${v.sourceName[0]}`,
    );
    return false;
  }
  return true;
}

async function main() {
  try {
    await fs.mkdir("rewritten");
  } catch {}
  for (const file of await fs.readdir("rewritten")) {
    await fs.unlink(`rewritten/${file}`);
  }
  const disableDiff = process.argv.includes("--no-diff");

  const results = await extractOneByOne(getTargetSpecs());
  const { astMap, errorMap } = tryParse(results);
  const validations = webidl2
    .validate([...astMap.values()].flat())
    .filter((v) => filterValidation(v, results));
  for (const v of validations) {
    if (v.autofix) {
      v.autofix();
    }
  }

  const affectedSpecs = [
    ...new Set(validations.map((v) => v.sourceName[0])),
  ].map((title) => ({ title }));
  for (const spec of affectedSpecs) {
    const targetSpecItem = results.get(spec.title);
    const includesHTML = blocksIncludeHTML(targetSpecItem.blocks);
    const diffs = replaceBlocksInSpec(astMap.get(spec.title), targetSpecItem);
    if (diffs.length) {
      let { text } = targetSpecItem;
      for (const diff of diffs) {
        text = similarReplace(text, diff[0], (match) => {
          return conditionalBracketEscape(match, diff[1]);
        });
      }
      spec.diff = true;
      spec.html = text;
      spec.original = targetSpecItem.text;
      spec.includesHTML = includesHTML;
    }
  }
  for (const spec of affectedSpecs) {
    if (spec.diff) {
      await fs.writeFile(`rewritten/${spec.title}`, spec.html);
      if (!disableDiff) {
        const diffText = createPatch(spec.title, spec.original, spec.html);
        await fs.writeFile(`rewritten/${spec.title}.patch`, diffText);
      }
    }

    await writeAsJson(`rewritten/${spec.title}.report.json`, {
      validations: validations.filter((v) => v.sourceName[0] === spec.title),
      diff: spec.diff,
      includesHTML: spec.includesHTML,
    });
  }

  for (const [title, error] of errorMap) {
    await writeAsJson(`rewritten/${title}.report.json`, {
      syntax: error,
    });
  }
}

await main();
