const fs = require("fs");

fs.unlinkSync(__dirname + "/../spec-info.json");
fs.writeFileSync(__dirname + "/../spec-sources.json", "{}");
