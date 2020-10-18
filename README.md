# webidl-updater
Crawl and find specs with autofixable invalid IDL codes.

Run `npm run rewrite` and the tool will crawl the specs and write files into a
directory named `rewritten/`, only for specs which include autofixable IDL problems.

## GitHub Authentication

`npm run crawl-raw-source` and `npm run create-pullrequest` require
`config.json` with `auth` field, which is a GitHub access token. See
[the Octokit documentation](https://octokit.github.io/rest.js/v18#authentication)
for more information.
