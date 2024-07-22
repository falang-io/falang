const fs = require('fs');

function deleteLineFromFile(props) {
  let data = fs.readFileSync(props.path, 'utf-8');
  data = data.replace('include: paths.appSrc,', '');
  fs.writeFileSync(props.path, data, 'utf-8');
}

deleteLineFromFile({
  path: 'node_modules/react-scripts/config/webpack.config.js',
  lineToRemove: { index: 384, value: 'include: paths.appSrc,' },
});