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
async function createPullRequest(updated, { owner, repo, branch, path }) {
  // whatever

  // should detect there already is a relevant PR

  const message = `[${path}] Align with Web IDL specification`;
  const body = `This is an automated pull request to align the spec with the latest Web IDL specification.

  Currently the autofix might introduce some awkward code formatting, so please feel free to modify the formatting.

  Please ping \`@saschanaz\` if you think this PR is invalid or should be enhanced.`;

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
  const repoResponse = await octokit.repos.get({ owner: forkOwner, repo });

  const base = repoResponse.data.default_branch;

  const listResponse = await octokit.repos.listCommits({
    owner,
    repo,
    sha: base,
    per_page: 1
  });
  let latestCommitSha = listResponse.data[0].sha;

  const head = `${branch}-${path}`;
  const ref = `refs/heads/${head}`;

  await octokit.git.createRef({
    owner: forkOwner,
    repo,
    sha: latestCommitSha,
    ref
  });

  const fileResponse = await octokit.repos.getContents({
    owner: forkOwner,
    repo,
    path,
    ref
  });

  await octokit.repos.createOrUpdateFile({
    owner: forkOwner,
    repo,
    branch: head,
    path,
    message,
    content: btoa(updated),
    sha: fileResponse.data.sha
  });

  await octokit.pulls.create({
    owner,
    repo,
    head: `${forkOwner}:${head}`,
    base,
    title: message,
    body
  });
//   return octokit
//     .createPullRequest({
//       owner,
//       repo,
//       title: message,
//       body: `This is an automated pull request to align the spec with the latest Web IDL specification.

// Please ping \`@saschanaz\` if you think this PR is invalid or should be enhanced.`,
//       base: branch /* optional: defaults to default branch */,
//       head: `update-idl-${branch}-${path}`,
//       changes: {
//         files: {
//           [path]: updated,
//         },
//         commit: message
//       }
//     });

  // what about deleting merged branch?
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
    await createPullRequest(file, value.github);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
})