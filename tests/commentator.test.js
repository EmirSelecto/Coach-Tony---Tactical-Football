const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('new results reset the scroll position and preserve commentary visibility', () => {
  const classes = () => {
    const values = new Set();
    return {
      add:name => values.add(name),
      remove:name => values.delete(name),
      contains:name => values.has(name)
    };
  };
  const headline = {}, explain = {}, copy = {scrollTop:50};
  const commentary = {classList:classes()};
  const box = {
    classList:classes(),
    querySelector:selector => ({'.headline':headline, '.explain':explain, '.result-copy':copy})[selector]
  };
  const field = {classList:classes(), offsetWidth:1};
  const document = {
    getElementById:id => ({resultBox:box, resultCommentary:commentary, fieldOuter:field})[id]
  };
  const context = vm.createContext({document, setTimeout(){}});
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'timeline.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function setResult(')), context);

  context.setResult('Touchdown', 'Six points', 'Quel jeu !');
  assert.equal(copy.scrollTop, 0);
  assert.equal(headline.textContent, 'Touchdown');
  assert.equal(explain.textContent, 'Six points');
  assert.equal(commentary.textContent, 'Quel jeu !');
  assert.equal(commentary.classList.contains('show'), true);

  copy.scrollTop = 20;
  context.setResult('Punt', 'Ballon rendu', '');
  assert.equal(copy.scrollTop, 0);
  assert.equal(commentary.textContent, '');
  assert.equal(commentary.classList.contains('show'), false);
  assert.equal(box.classList.contains('has-commentary'), false);
});
