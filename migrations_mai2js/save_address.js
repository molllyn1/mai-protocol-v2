const fs = require("fs");

module.exports = async function (group, addresses) {
    if (!process.env.ADDRESS_OUTPUT_PATH) {
        return;
    }
    const outputPath = process.env.ADDRESS_OUTPUT_PATH;
    let content = {};
    if (fs.existsSync(outputPath)) {
        content = JSON.parse(fs.readFileSync(outputPath));
    }
    content[group] = addresses;
    fs.writeFileSync(outputPath, JSON.stringify(content));

    console.log("   > Addresses has been successfully saved to", outputPath);
};
