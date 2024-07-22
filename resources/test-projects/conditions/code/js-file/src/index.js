const fs = require('fs');
const path = require('path');

const main = async () => {
  const fileContents = fs.readFileSync(path.resolve(__dirname, 'falang/_falang.js')).toString();
  const registry = eval(fileContents);
  const { main } = registry['main'];
  main({
    _falangGlobal: {
    }
  });
};

main();