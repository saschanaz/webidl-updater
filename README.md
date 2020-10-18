# webidl-updater
Find and rewrite specs with autofixable invalid IDL codes.

## NPM Commands

* `find-source-path`: Try finding raw source paths for specs and update
`spec-sources.browsers.generated.json`.
* `rewrite`: Download and rewrite the specs into a directory named
`rewritten/`, only for specs which include autofixable IDL problems.
* `submit-pullrequest`: Submits the rewritten specs.

### GitHub Authentication

`npm run crawl-raw-source` and `npm run submit-pullrequest` require
`config.json` with `auth` field, which is a
[GitHub access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token).
You can alternatively set `GH_TOKEN` environment variable. `config.json` will
be preferred when both exist.

## How to add your own spec

* Check whether [browser-specs](https://github.com/w3c/browser-specs/blob/HEAD/specs.json)
includes your spec, and file an issue there if not. Your spec should be covered
if it's listed there.
* If your spec is listed but is not receiving auto updates, it could be because
your source file path is uncommon, e.g. the file name is not `index.bs`/
`index.html` or it's not in the root directory. Renaming and moving your file
may fix it. Please file an issue if it still doesn't work.
