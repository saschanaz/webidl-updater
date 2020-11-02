const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
  auth: (() => {
    try { return require("../../config.json").auth }
    catch { return process.env.GH_TOKEN }
  })()
});

module.exports = {
  octokit
}
