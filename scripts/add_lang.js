const fs = require('fs');
const path = require('path');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const i18nConfigPath = path.resolve(__dirname, '../packages/common/i18n/src/i18n.json');
const i18nConfig = JSON.parse(fs.readFileSync(i18nConfigPath).toString());

const langs = ['ru', 'en'];

const getAnswer = (question) => {
  return new Promise((resolve) => {
    readline.question(question, (answer) => resolve(answer));
  });
}

const main = async () => {
  const newKey = await getAnswer(`Type new lang (separate by ':'):\n`);
  if(!newKey || newKey.indexOf(':') === -1) {
    console.log('Wrong key');
    process.exit();
  }
  const keyPath = newKey.split(':'); 
  for(const lang of langs) {
    addKey(i18nConfig[lang], [...keyPath]);
    addKey(i18nConfig[lang], [...keyPath]);
  }
  console.log('ok');
  process.exit();
}

function addKey(langObject, keyPath = []) {
  console.log(keyPath);
  const [firstValue] = keyPath.splice(0, 1);
  if(!firstValue) {
    console.log('no first value', firstValue,keyPath)

  }
  if(keyPath.length === 0) {
    console.log(1);
    if(firstValue in langObject) return;
    langObject[firstValue] = `todo:${firstValue}`;
    return;
  }
  if(typeof langObject[firstValue] === 'undefined') {
    langObject[firstValue] = {};
  }
  if(typeof langObject[firstValue] !== 'object') {
    console.log('wrong value for object', firstValue, langObject);
    return;
  }
  console.log('add');
  addKey(langObject[firstValue], keyPath);
}

main();