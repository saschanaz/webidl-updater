const fs = require("fs").promises;
const webidl2 = require("webidl2");
const { JSDOM } = require("jsdom");
const { fetchText } = require("./utils.js");
const { similarReplace } = require("./similar-replace.js");

const { extract } = require("reffy/src/cli/extract-webidl.js");

const specRawSources = require("../spec-sources.json");

/**
 * Loading everything in once tends to break, thus do it one by one
 */
async function extractOneByOne(specSourceList) {
  const results = [];
  for (const { rawUrl, url, shortName } of specSourceList) {
    const text = await fetchText(rawUrl || url);
    // Passing url or html to extract() will process everything,
    // so just skip it by passing jsdom object with script disabled.
    let { window } = new JSDOM(text);
    // eval is used for generater check, just skip it
    window.eval = () => {};
    results.push({
      ...await extract(window),
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
 */
function indent(str, by) {
  const prefix = " ".repeat(by);
  const lines = str.split("\n");
  return lines.map(line => prefix + line).join("\n");
}

(async () => {
  try {
    await fs.mkdir("rewritten");
  } catch {}
  for (const file of await fs.readdir("rewritten")) {
    await fs.unlink(`rewritten/${file}`);
  }

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
        const { innerHTML } = targetSpecItem.blocks[blockIndex];
        const reformed = indent(
          rewritten.replace(/>/g, "&gt;"),
          getFirstLineIndentation(innerHTML)
        );
        diffs.push([innerHTML, `${reformed}\n`]);
      }
    }
    if (diffs.length) {
      let { text } = targetSpecItem;
      for (const diff of diffs) {
        text = similarReplace(text, diff[0], diff[1]);
      }
      rewrittenSpecs.push({
        title: targetSpecItem.shortName || targetSpecItem.doc.title,
        html: text
      })
    }
  }
  for (const spec of rewrittenSpecs) {
    await fs.writeFile(`rewritten/${spec.title}`, spec.html);
  }
})().catch(e => {
  process.on("exit", () => {
    console.error(e);
  });
  process.exit(1);
})
