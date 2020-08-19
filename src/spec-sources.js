const browserSources = require("../spec-sources.browsers.generated.json");
const manualSources = require("../spec-sources.manual.json");

module.exports = { ...browserSources, ...manualSources };
