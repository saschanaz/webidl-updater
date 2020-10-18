const fs = require("fs").promises;
const webidl2 = require("webidl2");
const diff = require("diff");
const { JSDOM } = require("jsdom");
const { fetchText } = require("./utils.js");
const { similarReplace } = require("./similar-replace.js");

const extract = require("./utils/extract-webidl.js");

const specRawSources = require("./spec-sources.js");

const brokenSpecs = [
  "https://w3c.github.io/webappsec-trusted-types/dist/spec/",
  // https://github.com/immersive-web/layers/pull/200
  "https://immersive-web.github.io/layers/",
  "https://svgwg.org/specs/paths/",
  "https://svgwg.org/specs/animations/",
];

// includes some manual HTML inside IDL but shouldn't be hard to restore them
const manualHtmlAllowList = [
  "is-input-pending",
  "css-counter-styles-3",
  "webgl1",
  "webgl2",
  "generic-sensor",
  "media-capabilities",
  "mst-content-hint"
];

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
  const results = [];
  const targetSpecs = specSourceList.filter(item => !brokenSpecs.includes(item.url));
  const fetchedList = await Promise.all(targetSpecs.map(async item => {
    const text = await fetchText(getRawGit(item.github) || item.url);
    return {
      shortName: item.shortName,
      text
    };
  }));
  for (const { shortName, text } of fetchedList) {
    let { window } = new JSDOM(text);
    results.push({
      ...await extract(window.document),
      text,
      shortName
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
  return blocks.some(block => !!block.children.length);
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

  const filter = process.argv.slice(2).filter(a => !a.startsWith("-"));

  if (filter.length) {
    console.log(`Rewriting ${filter}...`);
    return specSourceList.filter(s => filter.includes(s.shortName));
  }
  console.log("Rewriting all specs...");
  return specSourceList;
}

(async () => {
  try {
    await fs.mkdir("rewritten");
  } catch {}
  for (const file of await fs.readdir("rewritten")) {
    await fs.unlink(`rewritten/${file}`);
  }
  const disableDiff = process.argv.includes("--no-diff");

  const results = await extractOneByOne(getTargetSpecs());
  const astArray = results.map(r => {
    return r.idl.map((idl, i) => webidl2.parse(idl, {
      concrete: true,
      sourceName: [r.shortName, i]
    }));
  });
  const validations = webidl2.validate(astArray.flat());
  for (const v of validations) {
    if (v.autofix) {
      v.autofix();
    }
  }
  const rewrittenSpecs = [];
  for (const [specIndex, spec] of Object.entries(astArray)) {
    const targetSpecItem = results[specIndex];
    if (blocksIncludeHTML(targetSpecItem.blocks)) {
      console.log(`${targetSpecItem.shortName} includes rich elements`)
      if (!manualHtmlAllowList.includes(targetSpecItem.shortName)) {
        console.log("Not allowlisted, skipping")
        continue;
      }
    }
    const diffs = replaceBlocksInSpec(spec, targetSpecItem);
    if (diffs.length) {
      let { text } = targetSpecItem;
      for (const diff of diffs) {
        text = similarReplace(text, diff[0], match => {
          return conditionalBracketEscape(match, diff[1]);
        });
      }
      rewrittenSpecs.push({
        title: targetSpecItem.shortName,
        html: text,
        original: targetSpecItem.text
      })
    }
  }
  for (const spec of rewrittenSpecs) {
    await fs.writeFile(`rewritten/${spec.title}`, spec.html);
    await fs.writeFile(
      `rewritten/${spec.title}.validations.txt`,
      validations.filter(v => v.sourceName[0] === spec.title).map(v => v.message).join("\n\n")
    );
    if (!disableDiff) {
      const diffText = diff.createPatch(spec.title, spec.original, spec.html);
      await fs.writeFile(`rewritten/${spec.title}.patch`, diffText);
    }
  }
})().catch(e => {
  process.on("exit", () => {
    console.error(e);
  });
  process.exit(1);
});
