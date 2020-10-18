# webidl-updater
Crawl and find specs with autofixable invalid IDL codes.

## NPM Commands

* `crawl-raw-source`: Detect raw source paths for specs.
* `rewrite`: Crawls the specs and write files into a directory named
`rewritten/`, only for specs which include autofixable IDL problems.
* `submit-pullrequest`: Submits the rewritten specs.

### GitHub Authentication

`npm run crawl-raw-source` and `npm run submit-pullrequest` require
`config.json` with `auth` field, which is a GitHub access token. See
[the Octokit documentation](https://octokit.github.io/rest.js/v18#authentication)
for more information.

## How to add your own spec

* Check whether [browser-specs](https://github.com/w3c/browser-specs/blob/HEAD/specs.json)
includes your spec, and file an issue there if not. Your spec should
be covered if it's listed there.
* If your spec is listed but is not receiving auto updates, it could
be because your source file path is uncommon, e.g. the file name is
not `index.bs`/`index.html` or it's not in the root directory.
Renaming and moving your file may fix it. Please file an issue if it
still doesn't work.
