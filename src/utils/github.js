import { Octokit } from "@octokit/rest";

import { createRequire } from "module";

const require = createRequire(import.meta.url);

function btoa(str) {
  return Buffer.from(str).toString("base64");
}

export const octokit = new Octokit({
  auth: (() => {
    try {
      return require("../../config.json").auth;
    } catch {
      return process.env.GH_TOKEN;
    }
  })(),
  log: console,
});

export class GitHubRepoBranch {
  /**
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   */
  constructor(owner, repo, branch) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * @param {string} login
   */
  async maybeCreateFork(login) {
    const forks = await octokit.repos.listForks({
      owner: this.owner,
      repo: this.repo,
    });
    const fork = forks.data.find((fork) => fork.owner.login === login);
    if (fork) {
      return fork;
    }
    const create = await octokit.repos.createFork({
      owner: this.owner,
      repo: this.repo,
    });
    return create.data;
  }

  async getLatestCommit() {
    return await octokit.repos.getCommit({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${this.branch}`,
    });
  }

  /**
   * @param {string} latestCommitSha
   */
  async ensureHeadExists(latestCommitSha) {
    let refInfoResponse;
    try {
      refInfoResponse = await octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      });
    } catch {}
    if (!refInfoResponse) {
      await octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        sha: latestCommitSha,
        ref: `refs/heads/${this.branch}`,
      });
    }
  }

  /**
   * @param {GitHubRepoBranch} upstream
   * @param {string} latestCommitSha
   */
  async ensureBranchIsLatest(upstream, latestCommitSha) {
    const pullsResponse = await octokit.pulls.list({
      owner: upstream.owner,
      repo: upstream.repo,
      state: "open",
      head: `${this.owner}:${this.branch}`,
    });

    if (!pullsResponse.data.length) {
      await this.forceUpdateBranch(latestCommitSha);
      return;
    }

    // check if the existing PR is mergeable
    const pullResponse = await octokit.pulls.get({
      owner: upstream.owner,
      repo: upstream.repo,
      pull_number: pullsResponse.data[0].number,
    });

    if (
      pullResponse.data.base.label !== `${upstream.owner}:${upstream.branch}`
    ) {
      await octokit.pulls.update({
        owner: upstream.owner,
        repo: upstream.repo,
        pull_number: pullResponse.data.number,
        base: upstream.branch,
      });
      await this.forceUpdateBranch(latestCommitSha);
    } else if (pullResponse.data.mergeable === true) {
      await this.mergeBranch(latestCommitSha);
    } else if (pullResponse.data.mergeable === false) {
      // null means it's being recomputed
      await this.forceUpdateBranch(latestCommitSha);
    }
  }

  /**
   * @param {string} latestCommitSha
   */
  async forceUpdateBranch(latestCommitSha) {
    await octokit.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      sha: latestCommitSha,
      ref: `heads/${this.branch}`,
      force: true,
    });
  }

  /**
   * @param {string} latestCommitSha
   */
  async mergeBranch(latestCommitSha) {
    await octokit.repos.merge({
      owner: this.owner,
      repo: this.repo,
      base: this.branch,
      head: latestCommitSha,
    });
  }

  /**
   * @param {string} path
   * @param {string} message
   * @param {string} updated
   */
  async updateFileOnBranch(path, message, updated) {
    const fileResponse = await octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: `refs/heads/${this.branch}`,
    });

    const content = btoa(updated);

    if (fileResponse.data.content.split(/\s/g).join("") !== content) {
      await octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        path,
        message,
        content,
        sha: fileResponse.data.sha,
      });
    }
  }

  /**
   * @param {GitHubRepoBranch} upstream
   */
  async maybeCreatePullRequest(upstream, title, body) {
    // Currently existing PR can potentially be closed
    const head = `${this.owner}:${this.branch}`;
    const pullsResponse2 = await octokit.pulls.list({
      owner: upstream.owner,
      repo: upstream.repo,
      state: "open",
      head,
    });

    if (!pullsResponse2.data.length) {
      await octokit.pulls.create({
        owner: upstream.owner,
        repo: upstream.repo,
        head,
        base: upstream.branch,
        title,
        body,
      });
    }
  }

  /**
   * @param {string | RegExp} matcher
   * @param {string} creator
   */
  async findIssue(matcher, creator) {
    const issues = await octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: "open",
      creator,
    });
    return issues.data.find((issue) => issue.title.match(matcher));
  }

  /**
   * @param {number} issueNumber
   * @param {string} newBody
   */
  async updateIssue(issueNumber, newBody) {
    const { data } = await octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: newBody,
    });
    return data;
  }

  /**
   * @param {string} title
   * @param {string} body
   */
  async createIssue(title, body) {
    const { data } = await octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
    });
    return data;
  }

  async closeIssue(issueNumber) {
    await octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: "closed",
    });
  }
}
