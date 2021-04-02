import { octokit, GitHubRepoBranch } from "./utils/github.js";
import specSources from "./spec-sources.js";
import { promises as fs } from "fs";

// Returns a normal Octokit PR response
// See https://octokit.github.io/rest.js/#octokit-routes-pulls-create

/**
 * This function:
 * - creates a local clone of the target spec
 * - creates a branch based on the target branch
 * - applies our autofixed source
 * - pushes it to the bot account
 * - and opens a pull request
 * @param {string} updated updated file content
 * @param {string} validations IDL validation messages
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
  const message = inMonoRepo
    ? `[${shortName}] Align with Web IDL specification`
    : "Editorial: Align with Web IDL specification";
  const body = `🤖 This is an automated pull request to align the spec with the latest Web IDL specification. 🤖

The following is the Web IDL validation message, which may help understanding this PR:

\`\`\`
${validations}
\`\`\`

Currently this autofix might introduce awkward code formatting, and feel free to manually fix it whenever it happens.

Please file an issue at https://github.com/saschanaz/webidl-updater/issues/new if you think this PR is invalid or should be enhanced.`;

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

const incompatible = [
  // Specs that mixes IDL and HTML elements
  "html",
  "webgl",
];

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

async function main() {
  const repoMap = createRepoMap();

  const sources = Object.values(specSources).filter(
    (value) => !incompatible.includes(value.shortName)
  );
  await Promise.all(
    sources.map(async (value) => {
      let file;
      let validations;
      try {
        file = await fs.readFile(`rewritten/${value.shortName}`, "utf-8");
        validations = await fs.readFile(
          `rewritten/${value.shortName}.validations.txt`,
          "utf-8"
        );
      } catch {
        return;
      }
      if (!value.github) {
        return;
      }
      await createPullRequest(
        file,
        validations,
        value.shortName,
        repoMap.get(value) > 1,
        value.github
      );
    })
  );
}

await main();
