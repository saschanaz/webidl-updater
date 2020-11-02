const browserSources = require("../spec-sources.browsers.generated.json");
const manualSources = require("../spec-sources.manual.json");

if (process.env.WEBIDL_UPDATER_TEST) {
  module.exports = {
    "https://raw.githubusercontent.com/saschanaz/test-spec/master/index.html": {
      "shortName": "test-spec",
      "url": "https://raw.githubusercontent.com/saschanaz/test-spec/master/index.html",
      "source": "https://github.com/saschanaz/test-spec/blob/HEAD/index.html",
      "github": {
        "owner": "saschanaz",
        "repo": "test-spec",
        "path": "index.html"
      }
    }
  }
} else {
  module.exports = { ...browserSources, ...manualSources };
}
