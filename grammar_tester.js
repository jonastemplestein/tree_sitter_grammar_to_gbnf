// need to run npm i --save ebnf
const Grammars = require('ebnf').Grammars;

console.log(Grammars)

const fs = require('fs');
let grammar;
if (process.argv.length < 3) {
  console.log('Usage: node grammar_tester.js <grammar_file>');
  process.exit(1);
} else {
  grammar = fs.readFileSync(process.argv[2], 'utf8');
}

let parser = new Grammars.BNF.Parser(grammar);