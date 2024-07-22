const fs = require('fs');
const path = require('path');

const projectTypes = [  "text",
"sequence",
"console_ts",
"console_js",
"console_rust",
"console_cpp",
"console_php",
"logic"];

const icons = [  "action",
"function_footer",
"function_header",
"timing-side",
"pseudo_cycle",
"foreach",
"function",
"if",
"lifegram_finish_icon",
"lifegram_function_icon",
"lifegram_return_icon",
"lifegram_root",
"parallel",
"parallel_thread",
"pseudo_cycle",
"switch",
"switch_option",
"while",
'create_var',
'assign_var',
'pseudo-cycle',
'from_to_cycle',
'log',
'arr_pop',
'arr_push',
'arr_shift',
'arr_unshift',
'link',
'output',
'input',
'rack',
'link',
'output',
'input',
'rack',
];

const templates = [
  'text',
  'text_lifegram',
  'function',
  'function_lifegram',
  'tree',
  'lifegram',
  'object_definition',
  'logic_external_apis',
];


const i18nConfigPath = path.resolve(__dirname, '../packages/common/i18n/src/i18n.json');
const i18nConfig = JSON.parse(fs.readFileSync(i18nConfigPath).toString());
//console.log(i18nConfig);

const keysByLanguages = {
  ru: [],
  en: [],
};

const addKeysByLanguages = {
  ru: [],
  en: [],
};

function addKeys(lang, langValue, parentPath = []) {
  if (typeof langValue === 'string') {
    keysByLanguages[lang].push(parentPath.join(':'));
  } else if (typeof langValue === 'object') {
    for (const key in langValue) {
      addKeys(lang, langValue[key], parentPath.concat([key]));
    }
  } else {
    console.error('Wrong value', langValue, parentPath);
    process.exit(1);
  }
}

addKeys('ru', i18nConfig.ru, []);
addKeys('en', i18nConfig.en, []);

const newKeysInRu = keysByLanguages.ru.filter((ruKey) => !keysByLanguages.en.includes(ruKey));
addKeysByLanguages.en.push(...newKeysInRu);
const newKeysInEn = keysByLanguages.en.filter((enKey) => !keysByLanguages.ru.includes(enKey));
addKeysByLanguages.ru.push(...newKeysInEn);

let allKeys = keysByLanguages.ru.concat(...newKeysInEn);
allKeys = allKeys.concat(...allKeys.filter((key) => key.includes(':')).map((key) => {
  const keyArr = key.split(':');
  return keyArr[keyArr.length - 1];
}));
const newKeys = new Set();
const ignoredKeys = new Set();

function scanMonorepoDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.resolve(dir, file);
    if (!fs.statSync(filePath).isDirectory()) continue;
    const tsConfigPath = path.resolve(filePath, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      scanProjectDir(path.resolve(filePath, 'src'));
    } else if (!['node_modules', 'build', 'src'].includes(file)) {
      scanMonorepoDir(filePath);
    }
  }
}

function scanProjectDir(dir) {
  const files = fs.readdirSync(dir);
  for(const file of files) {
    const filePath = path.resolve(dir, file);
    if(fs.statSync(filePath).isDirectory()) {
      scanProjectDir(filePath);
      continue;
    }
    if (!filePath.match(/\.ts$/) && !filePath.match(/\.tsx$/)) {
      continue;
    }
    const fileContents = fs.readFileSync(filePath).toString();
    const results = fileContents.match(/[^a-zA-Z]t\(([^\)]+)\)/g);
    processResults(results);
    const results2 = fileContents.match(/_\{([^\}]+)\}/g);
    processResults2(results2);
  }
}

function processResults(results) {
  if(!results) return;
  for(const result of results) {
    const index1 = result.indexOf('t(');
    const index2 = result.indexOf(')');
    const indexStart = index1 + 3;
    const indexEnd = index2 - 1;
    const key = result.slice(indexStart, indexEnd);
    processKey(key);
  }
}


function processResults2(results) {
  if(!results) return;
  for(const result of results) {
    const key = result.slice(2, result.length - 1);
    processKey(key);
  }
}

function processKey(key) {
  if(key.indexOf('$') !== -1 || key.indexOf('.') !== -1) {
    ignoredKeys.add(key);
  } else if(!allKeys.includes(key)) {
    newKeys.add(key);
  }
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

scanMonorepoDir(path.resolve(__dirname, '../packages'));
for(const icon of icons) {
  processKey(`icon:${icon}`);
}
for(const projectType of projectTypes) {
  processKey(`project:type:${projectType}`);
}

for(const temlpate of templates) {
  processKey(`templates:template_${temlpate}`);
  processKey(`templates:template_${temlpate}_description`);
}

for(const newKey of newKeys) {  
  const keyPath = newKey.split(':'); 
  addKey(i18nConfig.ru, [...keyPath]);
  addKey(i18nConfig.en, [...keyPath]);
}

console.log(i18nConfig);
console.log({ newKeysInRu, newKeysInEn, ignored: Array.from(ignoredKeys) });
console.log('ignored keys', );

if(!newKeys.size) {
  console.log('No new keys');
  process.exit();
} else {
  console.log('New keys:');
  Array.from(newKeys).forEach(key => {
    console.log(`+ ${key}`);
  })
}


const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question(`Type 'y' to write config [n]:`, answer => {
  if(answer !== 'y') {
    console.log('end');
    process.exit();
  }
  fs.writeFileSync(i18nConfigPath, JSON.stringify(i18nConfig, undefined, 2));
  console.log('ok');
  process.exit();
});