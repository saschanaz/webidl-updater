const { Octokit } = require("@octokit/rest");
const config = require("../config.json");
const specSources = require("../spec-sources.json");
const fs = require("fs").promises;

const octokit = new Octokit({
  auth: config.botAuth
  // ?? authentication, based on config.json
});

function btoa(str) {
  return Buffer.from(str).toString('base64');
}

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
 * @param {string} githubInfo.branch
 * @param {string} githubInfo.path
 */
async function createPullRequest(updated, validations, shortName, inMonoRepo, { owner, repo, branch, path }) {
  const message =
    inMonoRepo ? `[${shortName}] Align with Web IDL specification` :
    "Editorial: Align with Web IDL specification";
  const body = `This is an automated pull request to align the spec with the latest Web IDL specification.

Currently the autofix might introduce some awkward code formatting, so please feel free to modify the formatting.

Please file an issue on https://github.com/saschanaz/webidl-updater/issues/new if you think this PR is invalid or should be enhanced.

The following is the validation messages from webidl2.js, which may help understanding this PR:

\`\`\`
${validations}
\`\`\``;

  const user = await octokit.users.getAuthenticated();
  const forks = await octokit.repos.listForks({
    owner,
    repo
  });
  const hasFork = forks.data.find(
    fork => fork.owner.login === user.data.login
  );

  if (!hasFork) {
    await octokit.repos.createFork({
      owner,
      repo
    });
  }

  const forkOwner = "autokagami";

  const forkBranch = shortName;
  const head = `heads/${forkBranch}`;

  const baseCommitResponse = await octokit.repos.getCommit({
    owner,
    repo,
    ref: `refs/heads/${branch}`
  });
  const latestCommitSha = baseCommitResponse.data.sha;
  const forkHead = `${forkOwner}:${forkBranch}`;

  await ensureHeadExists(head);

  const pullsResponse = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: forkHead
  });

  if (pullsResponse.data.length) {
    // check if the existing PR is mergeable
    const pullResponse = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullsResponse.data[0].number
    });
    if (pullResponse.data.mergeable === true) {
      await mergeFromMaster();
    } else if (pullResponse.data.mergeable === false) { // null means it's being recomputed
      await forceUpdateToLatestCommit();
    }
  } else {
    // check if the branch is based on the latest commit
    const compareResponse = await octokit.repos.compareCommits({
      owner,
      repo,
      base: latestCommitSha,
      head: forkHead
    });
    if (compareResponse.data.status === "diverged") {
      await forceUpdateToLatestCommit();
    }
  }

  await updateFileOnBranch(forkBranch);

  // Currently existing PR can potentially be closed
  const pullsResponse2 = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: forkHead
  });

  if (!pullsResponse2.data.length) {
    await octokit.pulls.create({
      owner,
      repo,
      head: forkHead,
      base: branch,
      title: message,
      body
    });
  }

  async function updateFileOnBranch(branch) {
    const fileResponse = await octokit.repos.getContent({
      owner: forkOwner,
      repo,
      path,
      ref: `refs/heads/${branch}`
    });

    const content = btoa(updated);

    if (fileResponse.data.content.split(/\s/g).join("") !== content) {
      await octokit.repos.createOrUpdateFileContents({
        owner: forkOwner,
        repo,
        branch,
        path,
        message,
        content,
        sha: fileResponse.data.sha
      });
    }
  }

  async function ensureHeadExists(head) {
    let refInfoResponse;
    try {
      refInfoResponse = await octokit.git.getRef({
        owner: forkOwner,
        repo,
        ref: head
      });
    } catch {};
    if (!refInfoResponse) {
      await octokit.git.createRef({
        owner: forkOwner,
        repo,
        sha: latestCommitSha,
        ref: `refs/${head}`
      });
    }
  }

  async function forceUpdateToLatestCommit() {
    await octokit.git.updateRef({
      owner: forkOwner,
      repo,
      sha: latestCommitSha,
      ref: head,
      force: true
    });
  }

  async function mergeFromMaster() {
    await octokit.repos.merge({
      owner: forkOwner,
      repo,
      base: forkBranch,
      head: latestCommitSha
    });
  }
}

const incompatible = [
  // Specs that mixes IDL and HTML elements
  "html",
  "webgl",
];

function createRepoMap() {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  const sources = Object.values(specSources).filter(source => source.github)
  for (const source of sources) {
    const repo = `${source.github.owner}/${source.github.repo}`;
    if (map.has(repo)) {
      map.get(repo).push(source);
    } else {
      map.set(repo, [source]);
    }
  }
  return new WeakMap(
    sources.map(source => [
      source,
      map.get(`${source.github.owner}/${source.github.repo}`).length
    ])
  );
}

async function main() {
  const repoMap = createRepoMap();

  const sources = Object.values(specSources).filter(value => !incompatible.includes(value.shortName));
  await Promise.all(sources.map(async value => {
    let file;
    let validations;
    try {
      file = await fs.readFile(`rewritten/${value.shortName}`, "utf-8");
      validations = await fs.readFile(`rewritten/${value.shortName}.validations.txt`, "utf-8");
    } catch {
      return;
    }
    if (!value.github) {
      return;
    }
    await createPullRequest(file, validations, value.shortName, repoMap.get(value) > 1, value.github);
  }));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
})
