# webidl-updater
Crawl and find specs with autofixable invalid IDL codes.

Run `npm run rewrite` and the tool will crawl the specs and write files into a directory named `rewritten/`,
only for specs which include autofixable IDL problems.
