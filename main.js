const fs = require('fs');
const path = require('path');
const Apify = require('apify');
const pdfToTable = require('pdf-table-extractor');
const webpack = require('webpack');
const requestPromise = require('request-promise');

const { log } = console;

const removeEmpty = array => array.reduce((acc, cur) => {
  if (Array.isArray(cur)) {
    const deep = removeEmpty(cur);
    if (deep.length) {
      acc.push(deep);
    }
  } else if (!/^\s*$/.test(cur)) {
    acc.push(cur.trim());
  }
  return acc;
}, []);

const parseRows = (headers, rows) => (
  rows.map(row => (
    headers.reduce((obj, header, i) => {
      let current = row[i] || row[i + 1] || '\n';
      if (current.includes('\n')) {
        current = current.split('\n');
      } else {
        current = [].concat(current);
      }
      const output = removeEmpty(current);
      return Object.assign(obj, { [header]: output });
    }, {})
  ))
);

Apify.main(async () => {
  const { queryUrl } = await Apify.getValue('INPUT');

  if (!queryUrl) {
    throw new Error('Missing URL in INPUT!');
  }

  const options = {
    uri: queryUrl,
    encoding: null
  };

  log('Requesting URL: ', options.uri);
  const response = await requestPromise(options);
  const buffer = Buffer.from(response);

  const tmpTarget = 'temp.pdf';

  log(`Saving file to: ${tmpTarget}`);
  try {
    await fs.writeFileSync(tmpTarget, buffer);
    log('File saved.');
  } catch (err) {
    throw new Error(err);
  }

  const pathToPdf = path.join(__dirname, tmpTarget);

  log('Extracting PDF...');
  let pages;
  try {
    const { pageTables } = await new Promise((resolve, reject) => {
      pdfToTable(pathToPdf, resolve, reject);
    });
    pages = pageTables.map(({ tables: tbs }) => tbs);
  } catch (err) {
    throw new Error('while extracting to table', err);
  }
  const parsedPages = removeEmpty(pages);
  log(`Found ${parsedPages.length} page${parsedPages.length > 1 ? 's' : ''}`);

  const [firstPage] = parsedPages;
  const [headers] = firstPage;
  log(headers);

  const allRows = [].concat(...parsedPages);

  // Check Hynek's OUTPUT
  // Use it to train the classifier
  // https://api.apify.com/v1/execs/Gp2sgPzQE5nukKB7o/results?format=json&simplified=1

  const headerCheck = headers.join('');
  const filteredRows = allRows.filter(row => (
    row.join('') !== headerCheck
  ));

  const output = parseRows(headers, filteredRows);

  log('Setting OUTPUT...');
  await Apify.setValue('OUTPUT', output);

  log('Done.');
});
