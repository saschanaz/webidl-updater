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
 * This whatever function:
 * - creates a local clone of the target spec
 * - creates a branch based on the main branch
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

  let refInfo;
  try {
    refInfo = await octokit.git.getRef({
      owner: forkOwner,
      repo,
      ref: head
    });
  } catch {};

  if (!refInfo) {
    const listResponse = await octokit.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: 1
    });
    const latestCommitSha = listResponse.data[0].sha;

    await octokit.git.createRef({
      owner: forkOwner,
      repo,
      sha: latestCommitSha,
      ref
    });
  }

  const fileResponse = await octokit.repos.getContents({
    owner: forkOwner,
    repo,
    path,
    ref
  });

  await octokit.repos.createOrUpdateFile({
    owner: forkOwner,
    repo,
    branch: forkBranch,
    path,
    message,
    content: btoa(updated),
    sha: fileResponse.data.sha
  });

  const forkHead = `${forkOwner}:${forkBranch}`;
  const pulls = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: forkHead
  });
  if (!pulls.data.length) {
    await octokit.pulls.create({
      owner,
      repo,
      head: forkHead,
      base: branch,
      title: message,
      body
    });
  }
}

async function main() {
  for (const value of Object.values(specSources)) {
    let file;
    try {
      file = await fs.readFile(`rewritten/${value.shortName}`, "utf-8");
    } catch {
      break;
    }
    if (!value.github) {
      break;
    }
    await createPullRequest(file, value.shortName, value.github);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
})
