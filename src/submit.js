import { octokit, GitHubRepoBranch } from "./utils/github.js";
import specSources from "./utils/spec-sources.js";
import { promises as fs } from "fs";

const pleaseFileAnIssueText = `Please file an issue at https://github.com/saschanaz/webidl-updater/issues/new if you think this is invalid or should be enhanced.`;

/**
 * @param {boolean} inMonoRepo
 * @param {string} shortName
 */
function getTitlePrefix(inMonoRepo, shortName) {
  return inMonoRepo ? `[${shortName}] ` : "";
}

function getSyntaxErrorIssueTitle(inMonoRepo, shortName) {
  return getTitlePrefix(inMonoRepo, shortName) + "Web IDL syntax error";
}

function markdownError(error) {
  return `\`\`\`
${error.context}
\`\`\`

> WebIDLParseError: ${error.bareMessage}`;
}

/**
 * @param {string[]} items
 */
function markdownWrapAsList(items) {
  /**
   * @param {string} item
   */
  function wrapAsListItem(item) {
    return (
      "*" +
      item
        .split("\n")
        .map((line) => "  " + line)
        .join("\n")
        .slice(1)
    );
  }
  return items.map(wrapAsListItem).join("\n");
}

/**
 * This function:
 * - forks the target spec
 * - creates a branch based on the target branch
 * - push our autofixed source
 * - and opens a pull request
 * @param {string} updated updated file content
 * @param {object[]} validations IDL validation error objects
 * @param {string} shortName
 * @param {boolean} inMonoRepo
 * @param {object} githubInfo
 * @param {string} githubInfo.owner
 * @param {string} githubInfo.repo
 * @param {string} githubInfo.path
 */
async function createPullRequest(
  updated,
  validations,
  shortName,
  inMonoRepo,
  { owner, repo, path }
) {
  const message =
    (getTitlePrefix(inMonoRepo, shortName) || "Editorial: ") +
    "Align with Web IDL specification";
  const body = `🤖 This is an automated pull request to align the spec with the latest Web IDL specification. 🤖

The followings are the Web IDL validation messages, which may help understanding this PR:

${markdownWrapAsList(validations.map(markdownError))}

Currently this autofix might introduce awkward code formatting, and feel free to manually fix it whenever it happens.

${pleaseFileAnIssueText}`;

  const branch = (await octokit.repos.get({ owner, repo })).data.default_branch;
  const upstream = new GitHubRepoBranch(owner, repo, branch);

  const user = await octokit.users.getAuthenticated();
  const forkRepo = await upstream.maybeCreateFork(user.data.login);
  const fork = new GitHubRepoBranch(
    forkRepo.owner.login,
    forkRepo.name,
    shortName
  );

  const commitResponse = await upstream.getLatestCommit();
  const latestCommitSha = commitResponse.data.sha;

  await fork.ensureHeadExists(latestCommitSha);
  await fork.ensureBranchIsLatest(upstream, latestCommitSha);
  await fork.updateFileOnBranch(path, message, updated);
  await fork.maybeCreatePullRequest(upstream, message, body);
}

/**
 * @param {object} error
 * @param {string} shortName
 * @param {boolean} inMonoRepo
 * @param {object} githubInfo
 */
async function createIssueForSyntaxError(
  error,
  shortName,
  inMonoRepo,
  { owner, repo }
) {
  const title = getSyntaxErrorIssueTitle(inMonoRepo, shortName);
  const content = `🤖 This is an automatic issue report for Web IDL syntax error. 🤖

[webidl2.js](https://github.com/w3c/webidl2.js) says:

${markdownError(error)}

${pleaseFileAnIssueText}
`;

  const upstream = new GitHubRepoBranch(owner, repo);
  const user = await octokit.users.getAuthenticated();

  const issue = await upstream.findIssue(title, user.data.login);
  if (!issue) {
    return await upstream.createIssue(title, content);
  }
  if (issue.content !== content) {
    return await upstream.updateIssue(issue.number, content);
  }
  return issue;
}

async function maybeCloseIssueForSyntaxError(
  shortName,
  inMonoRepo,
  { owner, repo }
) {
  const title = getSyntaxErrorIssueTitle(inMonoRepo, shortName);

  const upstream = new GitHubRepoBranch(owner, repo);
  const user = await octokit.users.getAuthenticated();

  const issue = await upstream.findIssue(title, user.data.login);
  if (issue) {
    await upstream.closeIssue(issue.number);
  }
}

function createRepoMap() {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  const sources = Object.values(specSources).filter((source) => source.github);
  for (const source of sources) {
    const repo = `${source.github.owner}/${source.github.repo}`;
    if (map.has(repo)) {
      map.get(repo).push(source);
    } else {
      map.set(repo, [source]);
    }
  }
  return new WeakMap(
    sources.map((source) => [
      source,
      map.get(`${source.github.owner}/${source.github.repo}`).length,
    ])
  );
}

/**
 * @typedef {object} Report
 * @property {object[]=} validations
 * @property {object=} syntax
 * @property {boolean=} includesHTML
 *
 * @param {string} shortName
 * @returns {Promise<Report>}
 */
async function getReport(shortName) {
  let file;
  try {
    file = await fs.readFile(`rewritten/${shortName}.report.json`, "utf-8");
  } catch {
    return;
  }
  return JSON.parse(file);
}

/**
 * @param {string} shortName
 */
async function readRewrittenFile(shortName) {
  try {
    return await fs.readFile(`rewritten/${shortName}`, "utf-8");
  } catch {}
}

async function main() {
  const repoMap = createRepoMap();

  const sources = Object.values(specSources);
  for (const value of sources) {
    const report = await getReport(value.shortName);
    if (!report) {
      continue;
    }
    const inMonoRepo = repoMap.get(value) > 1;
    if (report.validations) {
      // No parser error, should close the issue if exists
      await maybeCloseIssueForSyntaxError(
        value.shortName,
        inMonoRepo,
        value.github
      );
      if (!report.includesHTML) {
        const file = await readRewrittenFile(value.shortName);
        if (!file) {
          continue;
        }
        await createPullRequest(
          file,
          report.validations,
          value.shortName,
          inMonoRepo,
          value.github
        );
      } else {
        // TODO: if includes HTML
      }
    } else if (report.syntax) {
      await createIssueForSyntaxError(
        report.syntax,
        value.shortName,
        inMonoRepo,
        value.github
      );
    } else {
      throw new Error(
        `No \`validations\` nor \`parser\` field in ${value.shortName}`
      );
    }
  }
}

await main();
