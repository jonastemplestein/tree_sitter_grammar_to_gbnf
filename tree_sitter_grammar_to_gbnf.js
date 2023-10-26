const fs = require('fs');

if (process.argv.length < 3) {
    console.log("Usage: node convert_to_gbnf.js <filename>");
    process.exit(1);
}

const fname = process.argv[2];

let json;
try {
    const fileContent = fs.readFileSync(fname, 'utf8');
    json = JSON.parse(fileContent);
} catch (err) {
    if (err.code === 'ENOENT') {
        console.error(`Error: File ${fname} not found.`);
    } else if (err instanceof SyntaxError) {
        console.error(`Error: Failed to parse JSON in file ${fname}.`);
    } else {
        console.error(`Error: An unexpected error occurred: ${err.message}`);
    }
    process.exit(1);
}

function fixSymbolsForGBNF(str) {

	// GBNF expects the root symbol to be called "root", but tree sitter calls it source
	if (str === 'source') {
		return 'root';
	}
	
	// some rules in elixir's grammar.json start with an underscore, but only hyphens are allowed in GBNF
    str = str.replaceAll('_', '-');
	
	return str;
}

function manageRule(name, rule) {
	let output = '';

	switch(rule.type)
	{
		case "ALIAS":
			output += " ( ";
			output += manageRule(rule.type, rule.content);
			output += " ) ";
		break;
		case "BLANK":
			console.log(rule.type);
		break;
		case "CHOICE": {
			let members = rule.members;
			let isOptional = members.length == 2 && members[1].type == "BLANK";
			if(isOptional) {
				output += " (";
				output += manageRule(rule.type, members[0]);
				output += " )? ";
			}
			else
			{
				output += " (";
				for(let idx in members) {
					if(idx > 0) output += " | ";
					output += manageRule(rule.type, members[idx]);
				}
				output += " ) ";
			}
		}
		break;
		case "FIELD":
			output += " ( ";
			output += manageRule(rule.type, rule.content);
			output += " ) ";
		break;
		case "IMMEDIATE_TOKEN":
			output += " ( ";
			output += manageRule(rule.type, rule.content);
			output += " ) ";
		break;
		case "PATTERN": {

			let value = rule.value;

			// rewrite some tree sitter regexp patterns that aren't supported in gbnf
			// this is hardcoded for the elixir tree sitter json, but could be automated for most use-cases
			let patterns = {
				"\\r?\\n": `"\\r"?"\\n"`,
				"[_\\p{Ll}\\p{Lm}\\p{Lo}\\p{Nl}\\u1885\\u1886\\u2118\\u212E\\u309B\\u309C][\\p{ID_Continue}]*[?!]?": `[a-zA-Z]+[?!]?`,

				"\\s*\\.\\s*": `ws* "." ws*`,
				"\\?(.|\\\\.)": `"?" "\\\\"? [^\\n]`,
				"[\\p{ID_Start}_][\\p{ID_Continue}@]*[?!]?": `[a-zA-Z@_]+[?!]?`,
				"[\\p{ID_Start}_][\\p{ID_Continue}@]*[?!]?": `[a-zA-Z@_]+[?!]?`,
				":\\s": `":" ws`,
				".*": `[^\\n]*`,
				"x[0-9a-fA-F]{1,2}": `"x" [0-9a-fA-F] [0-9a-fA-F]?`,
				"u[0-9a-fA-F]{4}": `"u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]`,
				"x{[0-9a-fA-F]+}": `"x{" [0-9a-fA-F]+ "}"`,
				"u{[0-9a-fA-F]+}": `"u{" [0-9a-fA-F]+ "}"`
			}
			
			let matched = false;
			for(let pattern in patterns) {
				if(value === pattern) {
					value = patterns[pattern];
					matched = true;
					break;
				}
			}
			// if(!matched) {
			// 	console.error(" no match", value);
			// }
			output += ` ${value}`;
		}
		break;
		case "PREC":
		case "PREC_DYNAMIC":
		case "PREC_LEFT":
		case "PREC_RIGHT":
			output += "  ( ";
			output += manageRule(rule.type, rule.content);
			output += " ) ";
		break;
		case "REPEAT":
			output += " ( ";
			output += manageRule(rule.type, rule.content);
			output += " )* ";
		break;
		case "REPEAT1":
			output += " (";
			output += manageRule(rule.type, rule.content);
			output += " )+ ";
		break;
		case "SEQ": {
			let members = rule.members;
			output += " (";
			for(let idx in members) {
				output += manageRule(rule.type, members[idx]);
			}
			output += " ) ";
		}
		break;

		case "STRING": {
			let value = rule.value;
			value = JSON.stringify(value);
			output += ` ${value} `;
		}
		break;

		case "SYMBOL":
			output += ` ${fixSymbolsForGBNF(rule.name)}`;
		break;

		case "TOKEN":
			output += " ( ";
			output += manageRule(rule.type, rule.content);
			output += " ) ";
		break;

		default:
			throw("Unknown rule type: " + rule.type);
	}

	return output;
}

let rules = json.rules;
let gbnfOutput = '';
for(let idx in rules) {
	let rule = rules[idx];
	gbnfOutput += `${fixSymbolsForGBNF(idx)} ::= ${manageRule(idx, rule)}\n\n`;
}

// add some extra rules for elixir specifically - these are defined using an external parser
// as described here https://github.com/elixir-lang/tree-sitter-elixir/blob/main/docs/index.md
// the [a-z]* is just a placeholder - it's not actually correct in any of these
let externals = {
	"-quoted-atom-start": ":",
	"-quoted-content-i-single": "[a-z]*",
	"-quoted-content-i-double": "[a-z]*",

	"-quoted-content-i-heredoc-single": "[a-z]*",
	"-quoted-content-i-heredoc-double": "[a-z]*",
	"-quoted-content-i-parenthesis": "[a-z]*",
	"-quoted-content-i-curly": "[a-z]*",
	"-quoted-content-i-square": "[a-z]*",
	"-quoted-content-i-angle": "[a-z]*",
	"-quoted-content-i-bar": "[a-z]*",
	"-quoted-content-i-slash": "[a-z]*",
	"-quoted-content-single": "[a-z]*",
	"-quoted-content-double": "[a-z]*",
	"-quoted-content-heredoc-single": "[a-z]*",
	"-quoted-content-heredoc-double": "[a-z]*",
	"-quoted-content-parenthesis": "[a-z]*",
	"-quoted-content-curly": "[a-z]*",
	"-quoted-content-square": "[a-z]*",
	"-quoted-content-angle": "[a-z]*",
	"-quoted-content-bar": "[a-z]*",
	"-quoted-content-slash": "[a-z]*",


	"-newline-before-do": `"\\n"`,
	"-newline-before-binary-operator": `"\\n"`,
	"-newline-before-comment": `"\\n"`,

	"-before-unary-op": `""`,
	"-not-in": `"not in"`,

	"-quoted-atom-start": `":"`,

	// this is one i've added for the \s regexp pattern, basically
	"ws": `[ \\t\\n]+`
}

for(let key in externals) {
	gbnfOutput += `${key} ::= ${externals[key]}\n\n`;
}

process.stdout.write(gbnfOutput);
