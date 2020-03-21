const fs = require("fs").promises;
const webidl2 = require("webidl2");
const diff = require("diff");
const { JSDOM } = require("jsdom");
const { fetchText } = require("./utils.js");
const { similarReplace } = require("./similar-replace.js");

const extract = require("reffy/builds/extract-webidl.js");

const specRawSources = require("../spec-sources.json");

const brokenSpecs = [
  "https://svgwg.org/specs/animations/",
  // https://github.com/w3c/csswg-drafts/issues/4683
  "https://drafts.csswg.org/resize-observer/",
];

function getRawGit(githubInfo) {
  if (!githubInfo) {
    return null;
  }
  const { owner, repo, branch, path } = githubInfo;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
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
    // Passing url or html to extract() will process everything,
    // so just skip it by passing jsdom object with script disabled.
    let { window } = new JSDOM(text);
    // eval is used for generater check, just skip it
    window.eval = () => {};
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
 * @param {string} str
 */
function getFirstLineIndentation(str) {
  const lines = str.split("\n");
  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/^\s*/);
      return match[0].length;
    }
  }
  return 0;
}

/**
 * @param {string} str
 * @param {number} by
 * @param {string} chr character to be used as indentation. Typically " "
 */
function indent(str, by, chr) {
  const prefix = chr.repeat(by);
  const lines = str.split("\n");
  return lines.map(line => line.trim() ? prefix + line : line).join("\n");
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

(async () => {
  try {
    await fs.mkdir("rewritten");
  } catch {}
  for (const file of await fs.readdir("rewritten")) {
    await fs.unlink(`rewritten/${file}`);
  }
  const disableDiff = process.argv.includes("--no-diff");

  const specSourceList = mapToArray(specRawSources);

  const results = await extractOneByOne(specSourceList);
  const astArray = results.map(r => {
    return r.idl.map((idl, i) => webidl2.parse(idl, {
      concrete: true,
      sourceName: [r.doc.title, i]
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
    let diffs = [];
    const targetSpecItem = results[specIndex];
    for (const [blockIndex, block] of Object.entries(spec)) {
      const originalIdl = targetSpecItem.idl[blockIndex];
      const rewritten = webidl2.write(block);
      if (originalIdl !== rewritten) {
        const { innerHTML, localName, previousSibling } = targetSpecItem.blocks[blockIndex];
        const indentSize = getFirstLineIndentation(innerHTML);
        const tabOrSpace = innerHTML.includes("\t") ? "\t" : " ";
        const blockIndentation = previousSibling ?
          previousSibling.textContent.match(/[ \t]*$/)[0]
          : ""
        const reformed =
          indent(rewritten, indentSize, tabOrSpace)
          + "\n" + blockIndentation;
        if (localName === "pre") {
          diffs.push([innerHTML, reformed]);
        } else {
          diffs.push([innerHTML, `\n${reformed}`]);
        }
      }
    }
    if (diffs.length) {
      let { text } = targetSpecItem;
      for (const diff of diffs) {
        text = similarReplace(text, diff[0], match => {
          return conditionalBracketEscape(match, diff[1]);
        });
      }
      rewrittenSpecs.push({
        title: targetSpecItem.shortName || targetSpecItem.doc.title,
        html: text,
        original: targetSpecItem.text
      })
    }
  }
  for (const spec of rewrittenSpecs) {
    await fs.writeFile(`rewritten/${spec.title}`, spec.html);
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
})
