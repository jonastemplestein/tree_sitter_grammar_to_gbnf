# tree_sitter_grammar_to_gbnf

*Just jotting down where I got to so that myself or somebody else can hopefully pick up where I left off in the future*

Inspired by [José's tweet](https://twitter.com/josevalim/status/1717201320799535578), I spent some time today trying to convert tree sitter grammars to GBNF so I could get llama.cpp to spit out valid source code in any language that has a tree sitter grammar.

My main interest is in Elixir, so I started with the [Elixir grammar](https://github.com/elixir-lang/tree-sitter-elixir). 


#### Here's some useful context I learned about tree sitter grammars and GBNF

- GBNF is a very simple file format - its documentation is [here](https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md) and a sample grammar for simplified version of C [looks like this](https://github.com/ggerganov/llama.cpp/blob/master/grammars/c.gbnf)
- Tree-sitter grammars are described in javascript, which then gets turned into a JSON files that describe the grammer. This is the [grammar.js file for Elixir](https://github.com/elixir-lang/tree-sitter-elixir/blob/main/grammar.js) and the resultant [grammar.json file is here](https://github.com/elixir-lang/tree-sitter-elixir/blob/main/src/grammar.json).
- Patterns in tree-sitter grammars are javascript regular expressions, which can include common regexp patterns such as `.` or `\s`, but also matchers for entire [unicode categories](https://www.compart.com/en/unicode/category) such as `\p{ID_Start}`. These aren't supported and need to be rewritten into GBNF.
- Tree-sitter grammars allow whitespace around tokens unless explitly specified that isn't the case. GBNF is the opposite and allows no whitespace, which is why most GBNF grammers have whitespace symbols all over the place
- Both tree sitter and the elixir tree sitter repo are extremely well documented. Here is the [tree-sitter documentation](https://tree-sitter.github.io/tree-sitter/creating-parsers) and here is the [tree-sitter-elixir documentation](https://github.com/elixir-lang/tree-sitter-elixir/blob/main/docs/parser.md).
- The point of the tree-sitter grammar is not just to describe what is valid in the grammar, but also to precisely label each bit of code, which is then used for e.g. syntax highlighting. This is a much bigger task and in the case of elixir necessitates complex logic that is probably not necessary for defining the basic language. In the case of the Elixir grammar, an "external scanner" is used for a large number of tokens. I think it is possible to describe the Elixir language for the purposes of constraining code generation in GBNF format, but I can't think of a fully automated way of generating the grammar from grammar.json because of this external scanner.
- Tree-sitter grammar has a concept of `extras`, which are symbols that could appear anywhere. GBNF has no such feature, so we probably need to manually insert newline symbols all over the place.


#### Here's where I got to

- I found an [old script](https://github.com/tree-sitter/tree-sitter/issues/1013#issuecomment-805787544) in a tree-sitter discussion thread that can convert tree-sitter grammar.json files into some ebnf file format (of which there are many). This got me started (and is also the reason why my script is in javascript)

- I spent a bunch of time getting the converted grammar to be parsed correctly by llama.cpp. I don't remember all the details but here are some of the steps
    - rename root symbol from to `root`
    - ensure that all symbols are lowercase with hyphens instead of underscores
    - create "external" symbols that are referenced in Elixir's grammar.json but not declared
    - rewrite regexp patterns into GBNF format (which doesn't allow things like `.`, `\s`, `\p`, `[a-z]{1,2}` etc)

- I found json files containing all unicode [categories](https://github.com/tree-sitter/tree-sitter/blob/master/cli/src/generate/prepare_grammar/unicode-categories.json) and [properties](https://github.com/tree-sitter/tree-sitter/blob/master/cli/src/generate/prepare_grammar/unicode-properties.json) here. In future these can be used to more accurately replace `\p` matchers in tree-sitter patterns. But I didn't get around to using these, yet, and have just hand-written simplified patterns for the Elixir grammar specifically.

- Then I started getting segfaults _after_ llama.cpp loads the model

- I managed to isolate the error to a simple self-referential grammar. Unfortunately such grammars don't appear to be supported by llama.cpp at the moment

- I filed a bug report with llama.cpp

As always, these things turn out to be more work than I would have thought. Even if/when llama.cpp supports these kinds of grammars, it now seems unlikely that we can *automatically* greate GBNF files for all tree-sitter grammars. But we should be able to automate a good chunk of it and then a person familiar with the language needs to manually finish the grammar I think.

### Update Oct 27

- [Turns out the segfault is the result of an infinite loop that gets triggered with left-recursive symbols.](https://github.com/ggerganov/llama.cpp/issues/3801#issuecomment-1781918825)

- We can avoid this by prefixing the `ws` symbol (or any other symbol really) in front of our rules (which we wanted to eventually do in most places anyway)

- This gets us to the llama.cpp prompt without segfaults!

- Unfortunately the model does't seem to output elixir code using the mistral 7B model, so more debugging on the grammar is needed. Worth noting that the mistral model does actually know some elixir when you don't force it to use the grammar

- Each token output by the LLM takes longer to produce than the one before. I suspect this means that the whole output is parsed in the grammar on each token, which wouldn't be performant enough for the purposes of forcing large chunks specific programming languages to be output :(
    
Here are a few prompts when running with the following model and parameters in llama.cpp

```zsh
% ./main --grammar-file elixir_no_left_recursion.gbnf --color --model mistral-7b-instruct-v0.1.Q6_K.gguf -t 7 -b 24 -n -1 --temp 0 -ngl 1 -ins
```

```
> add numbers 5 and 6 in elixir
 InElixiryoucanaddtwonumbersusingthefollowingcode

 nums

 1.5

 2.0

 3.0

 4.0

 5.0

 6.0

 7.0

 8.0

 9.0

 10.0

# and so on - it never stops and each token takes longer to print - probably because llama.cpp parses the complete output from scratch with each new token, which wouldn't work for code generation anyway
```

```
> hi
 Hello!

> write some code
 Sure!

 Can

> 
```

Turning the temperature up (in this case all the way to 2) gets some slightly more interesting output.

```

> hi
 Hello!

> write some code
 Sure!

 4.248632814209962e-304

> write an anonymous function to add two numbers
 Sure!

 Here
 is
 a
 simple
 example
 of
 an
 anonymous
 function
 that
 adds
 two
 numbers
 using
 the
 var
 keyword
 in
 JavaScript
 (
 es
 5
 and
 above
 versions
 supported
 ..
 function
 x
 (
 y
)
 {  returnxxY}
 xxxxAndxxxandyyaretypicallyreplacewiththeactualparameternaandbvariablevaluesinyourprogramxandyrespectiveseriouslyyourselectricmotorsforchargedathenewbatteryvoltageshouldbewegiveaproperresistancematchacrossalargecircuitsoastomaximizethepowerstoredinyours
> 
```

#### Next steps

While there seem to be some possible bugs on the llama.cpp side, there are still lots of avenues to explore here. @ejones made a really thoughtful reply to [my llama.cpp issues here](https://github.com/ggerganov/llama.cpp/issues/3801)

The best path forward would be to 

a) experiment with removing whitespace from model (without making it left-recursive to avoid the llama.cpp bug)
b) prompt specifically for code generation and consider including ``` blocks in the grammar to help the model understand what it's meant to do

If that gets the model producing Elixir code it would be worth lookin into the increasing per-token slowdown when using the grammar in llama.cpp

### Usage

```zsh
node tree_sitter_grammar_to_gbnf.js treesitter_elixir_grammar.json > elixir.gbnf
```

You can then use the `.gbnf` file with the `--grammar-file` argument of llama.cpp and get a segfault :)