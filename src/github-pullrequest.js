const Octokit = require("@octokit/rest");
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
 * @param {object} githubInfo
 * @param {string} githubInfo.owner
 * @param {string} githubInfo.repo
 * @param {string} githubInfo.branch
 * @param {string} githubInfo.path
 */
async function createPullRequest(updated, shortName, { owner, repo, branch, path }) {
  // whatever

  // should detect there already is a relevant PR

  const message = `[${shortName}] Align with Web IDL specification`;
  const body = `This is an automated pull request to align the spec with the latest Web IDL specification.

  Currently the autofix might introduce some awkward code formatting, so please feel free to modify the formatting.

  Please file an issue on https://github.com/saschanaz/webidl-updater/issues/new if you think this PR is invalid or should be enhanced.`;

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
  const head = `heads/${forkBranch}`
  const ref = `refs/${head}`;

  let refInfoResponse;
  try {
    refInfoResponse = await octokit.git.getRef({
      owner: forkOwner,
      repo,
      ref: head
    });
  } catch {};

  const baseCommitResponse = await octokit.repos.getCommit({
    owner,
    repo,
    ref: `refs/heads/${branch}`
  });
  const latestCommitSha = baseCommitResponse.data.sha;
  const forkHead = `${forkOwner}:${forkBranch}`;

  const pullsResponse = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: forkHead
  });

  if (!refInfoResponse) {
    await octokit.git.createRef({
      owner: forkOwner,
      repo,
      sha: latestCommitSha,
      ref
    });
  } else if (pullsResponse.data.length) {
    // check if the existing PR is mergeable
    const pullResponse = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullsResponse.data[0].number
    });
    if (pullResponse.data.mergeable === false) { // null means it's being recomputed
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

  const fileResponse = await octokit.repos.getContents({
    owner: forkOwner,
    repo,
    path,
    ref
  });

  const content = btoa(updated);

  if (fileResponse.data.content.split(/\s/g).join("") !== content) {
    await octokit.repos.createOrUpdateFile({
      owner: forkOwner,
      repo,
      branch: forkBranch,
      path,
      message,
      content,
      sha: fileResponse.data.sha
    });
  }

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

  async function forceUpdateToLatestCommit() {
    await octokit.git.updateRef({
      owner: forkOwner,
      repo,
      sha: latestCommitSha,
      ref: head,
      force: true
    });
  }
}

const incompatible = [
  // Specs that mixes IDL and HTML elements
  "html",
  "webgl",
];

async function main() {
  const sources = Object.values(specSources).filter(value => !incompatible.includes(value.shortName));
  await Promise.all(sources.map(async value => {
    let file;
    try {
      file = await fs.readFile(`rewritten/${value.shortName}`, "utf-8");
    } catch {
      return;
    }
    if (!value.github) {
      return;
    }
    await createPullRequest(file, value.shortName, value.github);
  }));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
})
