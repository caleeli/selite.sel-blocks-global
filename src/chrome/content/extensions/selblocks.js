/* Copyright 2011 Chris Noe
 * Copyright 2011, 2012, 2013, 2014 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
/**
 * SelBlocks Global = SelBlocks with functions callable across test cases.
 * Based on SelBlocks 2.0.1.
 * 
 * SelBlocksGlobal change log, as compared to SelBlocks, in chronological order:
 * - made functions (formerly scripts) callable across test cases
 * - made it compatible with Javscript strict mode - "use strict";
 * -- for that I've removed automatic access to stored variables (without using $). That affects mostly 'for' loop and right side of parameter assignments of 'call'. See SelBlocksGlobal.wiki.
 * - added some syntax sugar to Selenese: string{..}, object{..}, eval{..}, array[..]. See EnhancedSyntax.wiki.
 * - if/while/for, call, string{}, object{}, eval{} and array[] now recognise object "window" - just like getEval() did. 
 * -- therefore evalWithExpandedStoredVars, dropToLoop, returnFromFunction, parseArgs are now a part of Selenium.prototype
 * -- other helper functions are now a part of Selenium.prototype, where needed
 * - changed 'xyz instanceof Array' to Array.isArray(xyz); this may be needed to recognise Array instances passed from different global scope
 * - similarly, changed xyz.constructor==String to xyz.constructor && xyz.constructor.name==='String'
 * -----------
 * Notes from SelBlocks
 * 
 * Provides commands for Javascript-like looping and callable functions,
 *   with scoped variables, and JSON/XML driven parameterization.
 *
 * (SelBlocks installs as a Core Extension, not an IDE Extension, because it manipulates the Selenium object)
 * 
 * Concept of operation:
 *  - Selenium.reset() is intercepted to initialize the block structures.
 *  - testCase.nextCommand() is overridden for flow branching.
 *  - TestLoop.resume() is overridden by exitTest, and by try/catch/finally to manage the outcome of errors.
 *  - The static structure of command blocks is stored in blockDefs[] by script line number.
 *    E.g., ifDef has pointers to its corresponding elseIf, else, endIf commands.
 *  - The state of each function-call is pushed/popped on callStack as it begins/ends execution
 *    The state of each block is pushed/popped on the blockStack as it begins/ends execution.
 *    An independent blockStack is associated with each function-call. I.e., stacks stored on a stack.
 *    (Non-block commands do not appear on the blockStack.)
 *
 * Limitations:
 *  - Incompatible with flowControl (and derivatives), because they unilaterally override selenium.reset().
 *    Known to have this issue:
 *      selenium_ide__flow_control
 *      goto_while_for_ide
 *
 * Acknowledgements:
 *  SelBlocks reuses bits & parts of extensions: flowControl, datadriven, and include.
 *
 * Wishlist:
 *  - show line numbers in the IDE
 *  - validation of JSON & XML input files
 *  - highlight a command that is failed-but-caught in blue
 *
 * Changes since 1.5:
 *  - added try/catch/finally, elseIf, and exitTest commands
 *  - block boundaries enforced (jumping in-to and/or out-of the middle of blocks)
 *  - script/endScript is replaced by function/endFunction
 *  - implicit initialization of for loop variable(s)
 *  - improved validation of command expressions
 *
 * NOTE - The only thing special about SelBlocks parameters is that they are activated and deactivated
 *   as script execution flows into and out of blocks, (for/endFor, function/endFunction, etc).
 *   They are implemented as regular Selenium variables, and therefore the progress of an executing
 *   script can be monitored using the Stored Variables Viewer addon.
 **/

"use strict";
// =============== global functions as script helpers ===============
// getEval script helpers

// Find an element via locator independent of any selenium commands
// (findElementOrNull returns the first if there are multiple matches)
function $e(locator) {
  return selblocks.unwrapObject(selenium.browserbot.findElementOrNull(locator));
}

// Return the singular XPath result as a value of the appropriate type
function $x(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var node;
  if (resultType) {
    node = selblocks.xp.selectNode(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    node = selblocks.xp.selectElement(doc, xpath, contextNode);
  }
  return node;
}

// Return the XPath result set as an array of elements
function $X(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var nodes;
  if (resultType) {
    nodes = selblocks.xp.selectNodes(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    nodes = selblocks.xp.selectElements(doc, xpath, contextNode);
  }
  return nodes;
}

// selbocks name-space
(function($$){

  // =============== Javascript extensions as script helpers ===============
  // EXTENSION REVIEWERS:
  // Global functions are intentional features provided for use by end user's in their Selenium scripts.

  // eg: "dilbert".isOneOf("dilbert","dogbert","mordac") => true
  String.prototype.isOneOf = function(valuesObj)
  {
    var values = valuesObj;
    if (!Array.isArray(values)) {
      // copy function arguments into an array
      values = Array.prototype.slice.call(arguments);
    }
    var i;
    for (i = 0; i < this.length; i++) {
      if (values[i] == this) {
        return true;
      }
    }
    return false;
  };

  // eg: "red".mapTo("primary", ["red","green","blue"]) => primary
  String.prototype.mapTo = function(/* pairs of: string, array */)
  {
    var errMsg = " The map function requires pairs of argument: string, array";
    assert(arguments.length % 2 === 0, errMsg + "; found " + arguments.length);
    var i;
    for (i = 0; i < arguments.length; i += 2) {
      assert((typeof arguments[i].toLowerCase() === "string") && Array.isArray(arguments[i+1]),
        errMsg + "; found " + typeof arguments[i] + ", " + typeof arguments[i+1]);
      if (this.isOneOf(arguments[i+1])) {
        return arguments[i];
      }
    }
    return this;
  };

  // Return a translated version of a string
  // given string args, translate each occurrence of characters in t1 with the corresponding character from t2
  // given array args, if the string occurs in t1, return the corresponding string from t2, else null
  String.prototype.translate = function(t1, t2)
  {
    assert(t1.constructor === t2.constructor, "translate() function requires arrays of the same type");
    assert(t1.length === t2.length, "translate() function requires arrays of equal size");
    var i;
    if (t1.constructor && t1.constructor.name==='String' ) {
      var buf = "";
      for (i = 0; i < this.length; i++) {
        var c = this.substr(i,1);
        var t;
        for (t = 0; t < t1.length; t++) {
          if (c === t1.substr(t,1)) {
            c = t2.substr(t,1);
            break;
          }
        }
        buf += c;
      }
      return buf;
    }

    if ( Array.isArray(t1.constructor) ) {
      for (i = 0; i < t1.length; i++) {
        if (t1[i] == this) {
          return t2[i];
        }
      }
    }
    else {
      assert(false, "translate() function requires arguments of type String or Array");
    }
    return null;
  };

  // ----- SelBlocksGlobal:
    /** @param TestCase optional
     *  @return int 0-based index of given test case within the list of test cases
     *  of the test suite
     **/
    function testCaseIdx( givenTestCase ) {
      givenTestCase= givenTestCase || testCase;
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere()
      //  which calls globIdx() which calls testCaseIdx()
      if( typeof givenTestCase !=='object' ) {
          var msg= "SelBlocks error: in testCaseIdx(), param givenTestCase is not an object, neither global testCase is.";
          LOG.error( msg );
          throw new Error(msg);
      }
      if( editor.app.testSuite.tests.length==0 ) {
          var msg= "SelBlocks error: in testCaseIdx(), bad editor.app.testSuite.tests.length==0.";
          LOG.error( msg );
          throw new Error(msg);
      }
      for( var caseIndex=editor.app.testSuite.tests.length-1; caseIndex>=0; caseIndex-- ) {
          if( editor.app.testSuite.tests[caseIndex].content===givenTestCase ) {
              break;
          }
      }
      if( caseIndex<0 ) {
          var msg= "SelBlocks error: in testCaseIdx(), givenTestCase was not matched.";
          LOG.error( msg );
          throw new Error(msg);
      }
      return caseIndex;
    }

    function logAndThrow(msg) {
          var error= new Error(msg);
          LOG.error( msg+ "\n" +error.stack );
          throw error;    
    }

    /** This serves to generate unique global identifiers for test script commands.
     *  Results of this functions are usually values of symbols[] and other structures.
     *  @param {number} commandIndex 0-based index within givenTestCase (or within testCase).
     *  @param {TestCase} [givenTestCase] optional; using (current) testCase by default
    // I'd rather use objects, but Javascript doesn't compare objects field by field
    // - try javascript:a={first: 1}; b={first: 1}; a==b
     @returns {string} global index of the command, in form testCaseIndex/commandIndex
    */
    function globIdx( commandIndex, givenTestCase) {
      givenTestCase= givenTestCase || testCase;
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere() which calls globIdx()
      if( typeof commandIndex !=='number' || commandIndex<0 ) {
          logAndThrow( "SelBlocks error: in globIdx(), bad type/value of the first parameter commandIndex: " +commandIndex );
      }
      if( typeof givenTestCase !=='object' ) {
          logAndThrow( "SelBlocks error: in globIdx(), bad type of the optional second parameter givenTestCase (or global testCase)." );
      }
      var caseIndex= testCaseIdx(givenTestCase);
      return '' +caseIndex+ '/' +commandIndex;
    }
    /** @return {number} (not a Number object) 0-based index of the respective command within its test case
     * @param {string} globIdxValue Global index of a test command (test step).
     */
    function localIdx( globIdxValue ) {
      // Can't use assert() here, since assert indirectly calls fmtCmdRef() which calls localIdx() - recursion
      SeLiteMisc.ensureType( globIdxValue, 'string', 'globIdxValue must be a string' );
      if( typeof globIdxValue !== 'string' ) {
          SeLiteMisc.fail( 'globIdxValue must be a string, but got ' +(typeof globIdxValue)+ ': ' +globIdxValue );
          LOG.error( msg );
          throw new Error(msg);
      }
      var lastSlashIndex= globIdxValue.lastIndexOf('/');
      if( lastSlashIndex<=0 ) {
          var msg= 'globIdxValue must contain "/" and not as the first character.';
          LOG.error( msg );
          throw new Error(msg);
      }
      if( lastSlashIndex>=globIdxValue.length ) {
          var msg= 'globIdxValue must contain "/" and not as the last character.';
          LOG.error( msg );
          throw new Error(msg);
      }
      var afterSlash= globIdxValue.substr( lastSlashIndex+1 );
      var afterSlashNumber= new Number( afterSlash );
      if( afterSlash !== ''+afterSlashNumber ) {
          var msg= 'The part after "/" must be numeric.';
          LOG.error( msg );
          throw new Error(msg);
      }
      var result= afterSlashNumber.valueOf();
      //"TODO:"
      if( result<0 || result>=editor.app.testSuite.tests[localCaseIdxPart(globIdxValue)].content.commands.length ) {
          var msg= 'In localIdx("' +globIdxValue+ '"), result ' +result+ ' is not a valid command index';
          LOG.error( msg );
          throw new Error(msg);
      }
      return result;
    }
    /**@param string result of globIdx() or of labelIdx()
     * @return {number} (not a Number object) 0-based index of the test case (for the given global index)
     *  within the list of test cases (i.e. editor.app.testSuite.tests)
     */
    function localCaseIdxPart( globIdxValue ) {
      assert( typeof globIdxValue ==='string', 'globIdxValue must be a string.' );
      var lastSlashIndex= globIdxValue.lastIndexOf('/');
      assert( lastSlashIndex>0, 'globIdxValue must contain "/" and not as the first character.');
      assert( lastSlashIndex<globIdxValue.length-1, 'globIdxValue must contain "/" and not as the last character.');
      var beforeSlash= globIdxValue.substring( 0, globIdxValue.lastIndexOf('/') );
      var beforeSlashNumber= new Number( beforeSlash );
      assert( beforeSlash == ''+beforeSlashNumber, 'The part after "/" must be numeric.');
      var result= beforeSlashNumber.valueOf();
      assert( result>=0 && result<editor.app.testSuite.tests.length, 'result not a valid index into editor.app.testSuite.tests.');
      return result;
    }

    /** global array of _usable_ test cases, set in compileSelBlocks().
     *  It contains test cases in the same order as in editor.app.testSuite.tests[],
     *  but here they are as they come from editor.getTestCase()
     **/
    var testCases= [];

    // @return TestCase test case for the given global index
    function localCase( globIdxValue ) {
      var index= localCaseIdxPart(globIdxValue);
      assert( index<testCases.length, 'case index: ' +index+ ' but testCases[] has length ' +testCases.length );
      return testCases[ index ];
      /* Following didn't work:
       return editor.app.testSuite.tests[ localCaseIdxPart(globIdxValue) ].content;
      */
    }
    /** This serves to generate and compare keys in symbols[] for label commands
     *  @param string label name
     *  @param TestCase test case where the label is; optional - using testCase by default
     *  @return string global label identifier in form 'test-case-index/label'
     **/
    function labelIdx( label, givenTestCase ) {
        assert( typeof label ==='string', 'label must be a string.');
        givenTestCase= givenTestCase || testCase;
        return ''+testCaseIdx(givenTestCase)+ '/'+ label;
    }

    // @TODO on insert, validate that function names are unique, i.e. no function overriding
  //=============== Call/Scope Stack handling ===============
    /** @var object symbols {
     *    string equal to function's name => globIdx value
     *    string 'testCaseIndex:label-name' => globIdx value
     * }
     */
  var symbols = {};      // command indexes stored by name: function names
  /** @var {BlockDefs} Static command definitions stored by command index. Global, used for all test cases. */
  var blockDefs = null;  // static command definitions stored by command index
    /** @var {Stack} callStack Command execution stack */
  var callStack = null;  // command execution stack

  // the idx of the currently executing command
  // SelBlocksGlobal added param relativeShift and made it return a global, cross-test case index
  /** @param {number} [relativeShift=0] Relative shift to the current command's position
   *  @return {string} global command index
   * */
  function idxHere( relativeShift ) {
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere()
      return globIdx( localIdxHere(relativeShift) );
    }
  /** @param {number} [relativeShift=0] Relative shift to the current command's position
   *  @return {number} Current command's position (within current test case), adjusted by relativeShift. Depending on relativeShift the result may not be a valid position.
   * */
  function localIdxHere( relativeShift ) {
    relativeShift= relativeShift || 0;
    return testCase.debugContext.debugIndex+relativeShift;
  }

  // Command structure definitions, stored by command index
  // SelBlocksGlobal: stored by command global index - i.e. value of idxHere()
    function BlockDefs() {
      //@TODO use this.xxx=yyy, and define init() on BlockDefs.prototype. Then NetBeans navigation is easier.
      /** @var {object} Serving as an associative array {globIdx => object of {any attributes, idx, cmdName}}. SelBlocksGlobal changed this from an array to an object. */
      var blkDefs = {};
      // initialize an entry in BlockDefs instance at the given command global index
      /** @param {string} i Global index, a result of globIdx() function
       *  @param {Object} [attrs] Extra details to add, depending on the command:
       *  nature: 'if', 'try', 'loop', 'function'
       *  elseIfIdxs - array, used for 'if'
       *  ifIdx - used for 'else', 'elseIf' and 'endIf'; it's a global index of the matching 'if' step
       *  name - used for 'try', it's 'target' of the step (the 2nd column in Selenium IDE)
       *  tryIdx - used by 'catch', 'finally' and 'endTry', index of the matching 'try'
       *  finallyIdx
       *  beginIdx - used by 'continue', 'break', endWhile, endFor, endForeach, endForJson, endForXml;
       *    it's an index of the start of the current loop
       *  endIdx
       *  funcIdx - used by 'return', 'endfunction', 'endScript'
       *  @TODO check beginIdx and other fields - set after calls to blkDefFor(), blkDefAt()
       *  @return {object} A new entry just added to this collection.
       *  @see variable blkDefs
       **/
      blkDefs.init = function(i, attrs) {
        assert( typeof testCase.commands ==='object', 'BlockDefs::init() - testCase.commands is of bad type.');
        // @TODO assert regex numeric/numeric
        assert( typeof i ==='string', 'BlockDefs::init() - param i must be a globIdx() result.');
        // @TODO change to use 'this' instead of 'blkDefs' - it will be clearer.
        blkDefs[i] = attrs || {};
        blkDefs[i].idx = i;
        // Following line is from original SelBlocks, here just for documentation
        //blkDefs[i].cmdName = testCase.commands[i].command;
        blkDefs[i].cmdName = localCase(i).commands[ localIdx(i) ].command;
        return blkDefs[i];
      };
      return blkDefs;
    }

  // retrieve the blockDef at the given command idx
  /** @param {string} idx Global index of a test step. */
  function blkDefAt(idx) {
    return blockDefs[idx];
  }
  // retrieve the blockDef for the currently executing command
  function blkDefHere() {
    return blkDefAt(idxHere());
  }
  // retrieve the blockDef for the given blockDef frame
  function blkDefFor(stackFrame) {
    if (!stackFrame) {
      return null;
    }
    return blkDefAt(stackFrame.idx);
  }
  
  // An Array object with stack functionality
  function Stack() {
    var stack = [];
    stack.isEmpty = function() { return stack.length === 0; };
    stack.top = function()     { return stack[stack.length-1]; };
    stack.findEnclosing = function(_hasCriteria) { return stack[stack.indexWhere(_hasCriteria)]; };
    stack.indexWhere = function(_hasCriteria) { // undefined if not found
      var i;
      for (i = stack.length-1; i >= 0; i--) {
        if (_hasCriteria(stack[i])) {
          return i;
        }
      }
    };
    stack.unwindTo = function(_hasCriteria) {
      if (stack.length === 0) {
        return null;
      }
      while (!_hasCriteria(stack.top())) {
        stack.pop();
      }
      return stack.top();
    };
    stack.isHere = function() {
      return (stack.length > 0 && stack.top().idx === idxHere());
    };
    return stack;
  }
  
  // Determine if the given stack frame is one of the given block kinds
  Stack.isTryBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "try"); };
  Stack.isLoopBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "loop"); };
  Stack.isFunctionBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "function"); };
  
  // Flow control - we don't just alter debugIndex on the fly, because the command
  // preceding the destination would falsely get marked as successfully executed
  // SelBLocksGlobal: This is a global index of the next command - set to a result of globIdx()
  var branchIdx = null;

  // if testCase.nextCommand() ever changes, this will need to be revisited
  // (current as of: selenium-ide-2.4.0)
  // See Selenium's {a6fd85ed-e919-4a43-a5af-8da18bda539f}/chrome/content/testCase.js
  // This is for a head-intercept of TestCaseDebugContext.prototype.nextCommand(), and it adds support for SelBlocksGlobal branches (across test cases).
  // We can't redefine/tail-intercept testCase.debugContext.nextCommand() at the time
  // this SelBlocksGlobal source file is loaded, because testCase is not defined yet. Therefore we do it here
  // on the first run of the enclosing tail intercept of Selenium.prototype.reset() below.
  // And we intercept do it on the prototype, so that it applies to any test cases.
  function nextCommand() {
    LOG.debug( 'SelBlocks head-intercept of TestCaseDebugContext.nextCommand()');
    if( this.started ) {
      // SelBlocksGlobal hook for SeLite Bootstrap. @TODO This shouldn't be here, but in testcase-debug-context. However, that would currently be a pain in the neck due to http://code.google.com/p/selenium/issues/detail?id=6697 and https://code.google.com/p/selenium/issues/detail?id=5495.
      if( typeof Selenium.reloadScripts==='function' ) { // SeLite Bootstrap is loaded
          console.error('selblocks calling Selenium.reloadScripts()');
          Selenium.reloadScripts();
      }
      if (branchIdx !== null) {
        LOG.debug("Selblocks branch => " + fmtCmdRef(branchIdx));
        // Following uses -1 because the original nextCommand() will increase this.debugIndex by 1 when invoked below
        this.debugIndex = localIdx(branchIdx)-1;

        testCase= this.testCase= localCase(branchIdx);
        testCase.debugContext= this;
        branchIdx = null;
      }
    }
  }
  
  /** @param {string} globIdx value */
  function setNextCommand(cmdIdx) {
    var idx= localIdx(cmdIdx);
    var localTestCase= localCase(cmdIdx);
    assert( idx>=0 && idx< localTestCase.commands.length,
      " Cannot branch to non-existent command @" +cmdIdx );
    branchIdx = cmdIdx;
  }

(function () { // wrapper makes testCaseDebugContextWasIntercepted private
  var testCaseDebugContextWasIntercepted; // undefined or true
  // Selenium calls reset():
  //  * before each single (double-click) command execution
  //  * before a testcase is run
  //  * before each testcase runs in a running testsuite
  // TBD: skip during single command execution

  // SelBlocksGlobal: leavning the original indentation here, to make mergies easier:
  $$.fn.interceptAfter(Selenium.prototype, "reset", function()
  {
    $$.LOG.trace("In tail intercept :: Selenium.reset()");
    try {
      compileSelBlocks();
    } catch (err) {
      notifyFatalErr("In " + err.fileName + " @" + err.lineNumber + ": " + err);
    }
    callStack = new Stack();
    callStack.push({ blockStack: new Stack() }); // top-level execution state

    $$.tcf = { nestingLevel: -1 };

    if( testCaseDebugContextWasIntercepted===undefined ) {
    // customize flow control logic
    // TBD: this should be a tail intercept rather than brute force replace
    // SelBlocksGlobal: This is a head-intercept, rather than interceptReplace as in SelBlocks 2.0.1,
    // and I'm intercepting TestCaseDebugContext.prototype.nextCommand() rather than testCase.debugContext.nextCommand()
        $$.LOG.debug("Configuring head intercept: TestCaseDebugContext.prototype.nextCommand()");
        $$.fn.interceptBefore(TestCaseDebugContext.prototype, "nextCommand", nextCommand);
        testCaseDebugContextWasIntercepted= true;
    }
  });
    }
) ();

  // get the blockStack for the currently active callStack
  function activeBlockStack() {
    return callStack.top().blockStack;
  }

    // ================================================================================
    // Assemble block relationships and symbol locations
    function compileSelBlocks()
  {
      symbols= {}; // Let's clear symbols
      // Currently, this is called multiple times when Se IDE runs the whole test suite
      // - once per each test case. No harm in that, only a bit of wasted CPU.

      //alert( 'testCase===editor.suiteTreeView.getCurrentTestCase(): ' +(testCase===editor.suiteTreeView.getCurrentTestCase()) ); // --> false!
      //alert( 'testCase==editor.getTestCase(): ' +(testCase==editor.getTestCase()) ); //--> true!
      var testCaseOriginal= testCase;
      var testCaseOriginal= editor.getTestCase();
      var testCaseOriginalIndex= -1;
      testCases= [];
      //alert( 'editor.app.getTestSuite()===editor.app.testSuite: ' +editor.app.getTestSuite()===editor.app.testSuite ); // => false
      //alert( 'editor.app.testSuite.tests.indexOf( testCase): ' +editor.app.testSuite.tests.indexOf( testCase) ); // => -1
    // SelBlocksGlobal: I set blockDefs before looping through test cases, because it's global - for all test cases
    blockDefs = new BlockDefs();
      for( var testCaseIndex=0; testCaseIndex<editor.app.testSuite.tests.length; testCaseIndex++ ) {
        // Following call to showTestCaseFromSuite() sets gobal variable testCase
        editor.app.showTestCaseFromSuite( editor.app.getTestSuite().tests[testCaseIndex] );
        var curCase= editor.getTestCase();
        if( curCase===testCaseOriginal ) {
            testCaseOriginalIndex= testCaseIndex;
        }
        assert( curCase.debugContext && curCase.debugContext.currentCommand, 'curCase.debugContext.currentCommand not present!' );
        testCases.push( curCase );

        compileSelBlocksTestCase( curCase );
      }
      assert( testCaseOriginalIndex>=0, "testCaseOriginalIndex mut be non-negative!");
      // In the following, do not pass testCases[testCaseOriginalIndex].
      // is not the same as editor.app.getTestSuite().tests[testCaseOriginalIndex], because
      // Application.prototype.showTestCaseFromSuite(givenTestCase) calls this.setTestCase(givenTestCase.content)
      editor.app.showTestCaseFromSuite( editor.app.getTestSuite().tests[testCaseOriginalIndex] );
      testCase.debugContext.testCase= testCase;
  }
  // end of compileSelBlocks()
  
  // SelBlocksGlobal factored the following out of SelBlocks' compileSelBlocks(), to make 'testCase' not refer
  // to global testCase
  function compileSelBlocksTestCase( testCase ) {
    // SelBlocksGlobal: I set lexStack here, since it's local stack per testCase (and only used during compilation)
    var lexStack = new Stack();
    // SelBlocksGlobal: Following loop variable commandIndex was renamed from 'i' in SelBlocks.
    // I set variable 'i' to globIdx() value of commandIndex (i.e. of the original intended value of 'i'). This way
    // the original SelBlocks code still uses variable 'i', so there are less merge conflicts.
    var commandIndex;
    for (commandIndex = 0; commandIndex < testCase.commands.length; commandIndex++)
    {
      if (testCase.commands[commandIndex].type === "command")
      {
        var curCmd = testCase.commands[commandIndex].command;
        var aw = curCmd.indexOf("AndWait");
        if (aw !== -1) {
          // just ignore the suffix for now, this may or may not be a SelBlocks commands
          curCmd = curCmd.substring(0, aw);
        }
        var cmdTarget = testCase.commands[commandIndex].target;
        var i= globIdx(commandIndex, testCase);

        var ifDef;
        var tryDef;
        var expectedCmd;
        switch(curCmd)
        {
          case "label":
            assertNotAndWaitSuffix(i);
            symbols[ labelIdx(cmdTarget, testCase) ] = i;
            break;
          case "goto": case "gotoIf": case "skipNext":
            assertNotAndWaitSuffix(i);
            break;

          case "if":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "if", elseIfIdxs: [] }));
            break;
          case "elseIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("elseIf", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            var eIdx = blkDefFor(ifDef).elseIdx;
            if (eIdx) {
              notifyFatal(fmtCmdRef(eIdx) + " An else has to come after all elseIfs.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // elseIf -> if
            blkDefFor(ifDef).elseIfIdxs.push(i);           // if -> elseIf(s)
            break;
          case "else":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("if", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            if (blkDefFor(ifDef).elseIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one else associated with a given if.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // else -> if
            blkDefFor(ifDef).elseIdx = i;                  // if -> else
            break;
          case "endIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("if", i);
            ifDef = lexStack.pop();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            blockDefs.init(i, { ifIdx: ifDef.idx });       // endIf -> if
            blkDefFor(ifDef).endIdx = i;                   // if -> endif
            if (ifDef.elseIdx) {
              blkDefAt(ifDef.elseIdx).endIdx = i;          // else -> endif
            }
            break;

          case "try":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "try", name: cmdTarget }));
            break;
          case "catch":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i, ", is not valid without a try block");
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).catchIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one catch-block associated with a given try.");
            }
            var fIdx = blkDefFor(tryDef).finallyIdx;
            if (fIdx) {
              notifyFatal(fmtCmdRef(fIdx) + " A finally-block has to be last in a try section.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // catch -> try
            blkDefFor(tryDef).catchIdx = i;                // try -> catch
            break;
          case "finally":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i);
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).finallyIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one finally-block associated with a given try.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // finally -> try
            blkDefFor(tryDef).finallyIdx = i;              // try -> finally
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).finallyIdx = i;    // catch -> finally
            }
            break;
          case "endTry":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i);
            tryDef = lexStack.pop();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (cmdTarget) {
              assertMatching(tryDef.name, cmdTarget, i, tryDef.idx); // pair-up on try-name
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // endTry -> try
            blkDefFor(tryDef).endIdx = i;                  // try -> endTry
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).endIdx = i;        // catch -> endTry
            }
            break;

          case "while":    case "for":    case "foreach":    case "forJson":    case "forXml":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "loop" }));
            break;
          case "continue": case "break":
            assertNotAndWaitSuffix(i);
            assertCmd(i, lexStack.findEnclosing(Stack.isLoopBlock), ", is not valid outside of a loop");
            blockDefs.init(i, { beginIdx: lexStack.top().idx }); // -> begin
            break;
          case "endWhile": case "endFor": case "endForeach": case "endForJson": case "endForXml":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(expectedCmd, i);
            var beginDef = lexStack.pop();
            assertMatching(beginDef.cmdName.toLowerCase(), expectedCmd, i, beginDef.idx);
            blkDefFor(beginDef).endIdx = i;                // begin -> end
            blockDefs.init(i, { beginIdx: beginDef.idx }); // end -> begin
            break;

          case "loadJsonVars": case "loadXmlVars":
            assertNotAndWaitSuffix(i);
            break;

          case "call":
            assertNotAndWaitSuffix(i);
            blockDefs.init(i);
            break;
          case "function":     case "script":
            assertNotAndWaitSuffix(i);
            symbols[cmdTarget] = i;
            lexStack.push(blockDefs.init(i, { nature: "function", name: cmdTarget }));
            break;
          case "return":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("function", i, ", is not valid outside of a function/endFunction block");
            var funcCmd = lexStack.findEnclosing(Stack.isFunctionBlock);
            blockDefs.init(i, { funcIdx: funcCmd.idx });   // return -> function
            break;
          case "endFunction":  case "endScript":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(expectedCmd, i);
            var funcDef = lexStack.pop();
            assertMatching(funcDef.cmdName.toLowerCase(), expectedCmd, i, funcDef.idx);
            if (cmdTarget) {
              assertMatching(funcDef.name, cmdTarget, i, funcDef.idx); // pair-up on function name
            }
            blkDefFor(funcDef).endIdx = i;                 // function -> endFunction
            blockDefs.init(i, { funcIdx: funcDef.idx });   // endFunction -> function
            break;

          case "exitTest":
            assertNotAndWaitSuffix(i);
            break;
          default:
            }
          }
        }
    if (!lexStack.isEmpty()) {
      // unterminated block(s)
      var cmdErrors = [];
      while (!lexStack.isEmpty()) {
        var pend = lexStack.pop();
        cmdErrors.unshift(fmtCmdRef(pend.idx) + " without a terminating "
          + "'end" + pend.cmdName.substr(0, 1).toUpperCase() + pend.cmdName.substr(1) + "'"
        );
      }
      throw new SyntaxError(cmdErrors.join("; "));
    }
    //- command validation
    function assertNotAndWaitSuffix(cmdIdx) {
      assertCmd(cmdIdx, localCase(cmdIdx).commands[ localIdx(cmdIdx) ].command.indexOf("AndWait") === -1,
        ", AndWait suffix is not valid for SelBlocks commands");
    }
    //- active block validation
    function assertBlockIsPending(expectedCmd, cmdIdx, desc) {
      assertCmd(cmdIdx, !lexStack.isEmpty(), desc || ", without an beginning [" + expectedCmd + "]");
    }
    //- command-pairing validation
    function assertMatching(curCmd, expectedCmd, cmdIdx, pendIdx) {
      assertCmd(cmdIdx, curCmd === expectedCmd, ", does not match command " + fmtCmdRef(pendIdx));
    }
  } // end of compileSelBlocksTestCase()

  // --------------------------------------------------------------------------------

  // prevent jumping in-to and/or out-of loop/function/try blocks
  function assertIntraBlockJumpRestriction(fromIdx, toIdx) {
    var fromRange = findBlockRange(fromIdx);
    var toRange   = findBlockRange(toIdx);
    if (fromRange || toRange) {
      var msg = " Attempt to jump";
      if (fromRange) { msg += " out of " + fromRange.desc + fromRange.fmt(); }
      if (toRange)   { msg += " into " + toRange.desc + toRange.fmt(); }
      assert(fromRange && fromRange.equals(toRange), msg 
        + ". You cannot jump into, or out of: loops, functions, or try blocks.");
    }
  }

  // ascertain in which, if any, block that an locusIdx occurs
  function findBlockRange(locusIdx) {
    var idx;
    for (idx = locusIdx-1; idx >= 0; idx--) {
      var blk = blkDefAt(idx);
      if (blk) {
        if (locusIdx > blk.endIdx) { // ignore blocks that are inside this same block
          continue;
        }
        switch (blk.nature) {
          case "loop":     return new CmdRange(blk.idx, blk.endIdx, blk.cmdName + " loop");
          case "function": return new CmdRange(blk.idx, blk.endIdx, "function '" + blk.name + "'");
          case "try":      return isolateTcfRange(locusIdx, blk);
        }
      }
    }
    // return as undefined (no enclosing block at all)
  }

  // pin-point in which sub-block, (try, catch or finally), that the idx occurs
  function isolateTcfRange(idx, tryDef) {
    // assumptions: idx is known to be between try & endTry, and catch always precedes finally
    var RANGES = [
      { ifr: tryDef.finallyIdx, ito: tryDef.endIdx,     desc: "finally", desc2: "end" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.finallyIdx, desc: "catch",   desc2: "finally" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.endIdx,     desc: "catch",   desc2: "end" }
     ,{ ifr: tryDef.idx,        ito: tryDef.catchIdx,   desc: "try",     desc2: "catch" }
     ,{ ifr: tryDef.idx,        ito: tryDef.finallyIdx, desc: "try",     desc2: "finally" }
     ,{ ifr: tryDef.idx,        ito: tryDef.endIdx,     desc: "try",     desc2: "end" }
    ];
    var i;
    for (i = 0; i < RANGES.length; i++) {
      var rng = RANGES[i];
      if (rng.ifr <= idx && idx < rng.ito) {
        var desc = rng.desc + "-block";
        if (rng.desc !== "try") { desc += " for"; }
        if (tryDef.name)       { desc += " '" + tryDef.name + "'"; }
        return new CmdRange(rng.ifr, rng.ito, desc);
      }
    }
  }

  // represents a range of script lines
  function CmdRange(topIdx, bottomIdx, desc) {
    this.topIdx = topIdx;
    this.bottomIdx = bottomIdx;
    this.desc = desc;
    this.equals = function(cmdRange) {
      return (cmdRange && cmdRange.topIdx === this.topIdx && cmdRange.bottomIdx === this.bottomIdx);
    };
    this.fmt = function() {
      return " @[" + (this.topIdx+1) + "-" + (this.bottomIdx+1) + "]";
    };
  }

  // ==================== SelBlocks Commands (Custom Selenium Actions) ====================

  var iexpr = Object.create($$.InfixExpressionParser);

  // validate declared variable/parameter name (without $ prefix)
  function validateName(name, desc) {
    var match = name.match(/^[a-zA-Z]\w*$/);
    if (!match) {
      notifyFatal("Invalid character(s) in " + desc + " name: '" + name + "'");
    }
  }

  Selenium.prototype.doLabel = function() {
    // noop
  };
    
  // SelBlocksGlobal
  var expandStoredVarsRegex= /\$(\w[a-zA-Z_0-9]*)/g;
  /** @param {string} expression
   *  @return {string} expression, with any $xyz replaced by storedVars.xyz
   * */
  function expandStoredVars( expression ) {
      return expression.replace( expandStoredVarsRegex, 'storedVars.$1' );
  }
    
  // Skip the next N commands (default is 1)
  Selenium.prototype.doSkipNext = function(spec)
  {
    assertRunning();
    var n = parseInt(this.evalWithExpandedStoredVars(spec), 10);
    if (isNaN(n)) {
      if (spec.trim() === "") { n = 1; }
      else { notifyFatalHere(" Requires a numeric value"); }
    }
    else if (n < 0) {
      notifyFatalHere(" Requires a number > 1");
    }

    if (n !== 0) { // if n=0, execute the next command as usual
      destIdx = globIdx(localIdxHere()+n+1);
      assertIntraBlockJumpRestriction(localIdxHere(), localIdxHere()+n+1);
      setNextCommand(destIdx);
    }
  };

  Selenium.prototype.doGoto = function(label)
  {
    assertRunning();
    var symbolIndex= labelIdx(label);
    assert(symbols[symbolIndex], " Target label '" + label + "' is not found.");
    assertIntraBlockJumpRestriction(localIdxHere(), localIdx(symbols[symbolIndex]));
    setNextCommand(symbols[symbolIndex]);
  };

  Selenium.prototype.doGotoIf = function(condExpr, label)
  {
    assertRunning();
    if (this.evalWithExpandedStoredVars(condExpr))
      this.doGoto(label);
  };

  // ================================================================================
  Selenium.prototype.doIf = function(condExpr, locator)
  {
    assertRunning();
    var ifDef = blkDefHere();
    var ifState = { idx: idxHere(), elseIfItr: arrayIterator(ifDef.elseIfIdxs) };
    activeBlockStack().push(ifState);
    this.cascadeElseIf(ifState, condExpr);
  };
  Selenium.prototype.doElseIf = function(condExpr)
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefAt(blkDefHere().ifIdx).endIdx);
    }
    else {
      this.cascadeElseIf(ifState, condExpr);
    }
  };
  Selenium.prototype.doElse = function()
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into else-block
  };
  Selenium.prototype.doEndIf = function() {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    activeBlockStack().pop();
    // fall out of if-endIf
  };

  Selenium.prototype.cascadeElseIf= function(ifState, condExpr) {
    this.assertCompilable("", condExpr, ";", "Invalid condition");
    if (!this.evalWithExpandedStoredVars(condExpr)) {
      // jump to next elseIf or else or endif
      var ifDef = blkDefFor(ifState);
      if (ifState.elseIfItr.hasNext()) { setNextCommand(ifState.elseIfItr.next()); }
      else if (ifDef.elseIdx)          { setNextCommand(ifDef.elseIdx); }
      else                             { setNextCommand(ifDef.endIdx); }
    }
    else {
      ifState.skipElseBlocks = true;
      // continue into if/elseIf block
    }
  };

  // ================================================================================

  // throw the given Error
  Selenium.prototype.doThrow = function(err) {
    err = this.evalWithExpandedStoredVars(err);
    // @TODO? cascade check that .constructor.name==='Error' or its parent constructor
    if (!(err instanceof Error)) {
      err = new SelblocksError(idxHere(), err);
    }
    throw err;
  };

  // TBD: failed locators/timeouts/asserts ?
  Selenium.prototype.doTry = function(tryName)
  {
    assertRunning();
    var tryState = { idx: idxHere(), name: tryName };
    activeBlockStack().push(tryState);
    var tryDef = blkDefHere();

    if (!tryDef.catchIdx && !tryDef.finallyIdx) {
      $$.LOG.warn(fmtCurCmd() + " does not have a catch-block nor a finally-block, and therefore serves no purpose");
      if ($$.tcf.nestingLevel === -1) {
        return; // continue into try-block without any special error handling
      }
    }

    // log an advisory about the active catch block
    if (tryDef.catchIdx) {
      var errDcl = testCase.commands[ localIdx(tryDef.catchIdx) ].target;
      $$.LOG.debug(tryName + " catchable: " + (errDcl || "ANY"));
    }

    $$.tcf.nestingLevel++;
    tryState.execPhase = "trying";

    if ($$.tcf.nestingLevel === 0) {
      // enable special command handling
      var self= this;
      $$.fn.interceptPush(editor.selDebugger.runner.IDETestLoop.prototype, "resume",
          $$.handleAsTryBlock, {
            handleError: function(err) {
              return self.handleCommandError(err);
            }
          });
    }
    $$.LOG.debug("++ try nesting: " + $$.tcf.nestingLevel);
    // continue into try-block
  };

  Selenium.prototype.doCatch = function()
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    var tryState = activeBlockStack().top();
    if (tryState.execPhase !== "catching") {
      // skip over unused catch-block
      var tryDef = blkDefFor(tryState);
      if (tryDef.finallyIdx) {
        setNextCommand(tryDef.finallyIdx);
      }
      else {
        setNextCommand(tryDef.endIdx);
      }
    }
    $$.LOG.debug("entering catch block");
    // else continue into catch-block
  };
  Selenium.prototype.doFinally = function() {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    $$.LOG.debug("entering finally block");
    // continue into finally-block
  };
  Selenium.prototype.doEndTry = function(tryName)
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    var tryState = activeBlockStack().pop();
    if (tryState.execPhase) { // ie, it DOES have a catch and/or a finally block
      $$.tcf.nestingLevel--;
      $$.LOG.debug("-- try nesting: " + $$.tcf.nestingLevel);
      if ($$.tcf.nestingLevel < 0) {
        // discontinue try-block handling
        $$.fn.interceptPop();
        // $$.tcf.bubbling = null;
      }
      if ($$.tcf.bubbling) {
        this.reBubble();
      }
      else {
        $$.LOG.debug("no bubbling in process");
      }
    }
    var tryDef = blkDefFor(tryState);
    $$.LOG.debug("end of try '" + tryDef.name + "'");
    // fall out of endTry
  };

  // --------------------------------------------------------------------------------

  // alter the behavior of Selenium error handling
  //   returns true if error is being managed
  Selenium.prototype.handleCommandError= function(err)
  {
    var tryState = bubbleToTryBlock(Stack.isTryBlock);
    var tryDef = blkDefFor(tryState);
    $$.LOG.debug("error encountered while: " + tryState.execPhase);
    if (hasUnspentCatch(tryState)) {
      if (this.isMatchingCatch(err, tryDef.catchIdx)) {
        // an expected kind of error has been caught
        $$.LOG.info("@" + (idxHere(+1)) + ", error has been caught" + fmtCatching(tryState));
        tryState.hasCaught = true;
        tryState.execPhase = "catching";
        storedVars._error = err;
        $$.tcf.bubbling = null;
        setNextCommand(tryDef.catchIdx);
        return true;
      }
    }
    // error not caught .. instigate bubbling
    $$.LOG.debug("error not caught, bubbling error: '" + err.message + "'");
    $$.tcf.bubbling = { mode: "error", error: err, srcIdx: idxHere() };
    if (hasUnspentFinally(tryState)) {
      $$.LOG.info("Bubbling suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      return true;
    }
    if ($$.tcf.nestingLevel > 0) {
      $$.LOG.info("No further handling, error bubbling will continue outside of this try.");
      setNextCommand(tryDef.endIdx);
      return true;
    }
    $$.LOG.info("No handling provided in this try section for this error: '" + err.message + "'");
    return false; // stop test
  };

  // execute any enclosing finally block(s) until reaching the given type of enclosing block
  Selenium.prototype.bubbleCommand= function(cmdIdx, _isContextBlockType)
  {
    var self= this;
    //- determine if catch matches an error, or there is a finally, or the ceiling block has been reached
    var isTryWithMatchingOrFinally= function(stackFrame) {
      if (_isContextBlockType && _isContextBlockType(stackFrame)) {
        return true;
      }
      if ($$.tcf.bubbling && $$.tcf.bubbling.mode === "error" && hasUnspentCatch(stackFrame)) {
        var tryDef = blkDefFor(stackFrame);
        if (self.isMatchingCatch($$.tcf.bubbling.error, tryDef.catchIdx)) {
          return true;
        }
      }
      return hasUnspentFinally(stackFrame);
    };
    
    var tryState = bubbleToTryBlock(isTryWithMatchingOrFinally);
    var tryDef = blkDefFor(tryState);
    $$.tcf.bubbling = { mode: "command", srcIdx: cmdIdx, _isStopCriteria: _isContextBlockType };
    if (hasUnspentFinally(tryState)) {
      $$.LOG.info("Command " + fmtCmdRef(cmdIdx) + ", suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      // begin finally block
    }
    else {
      $$.LOG.info("No further handling, bubbling continuing outside of this try.");
      setNextCommand(tryDef.endIdx);
      // jump out of try section
    }
  };

  //- error message matcher
  Selenium.prototype.isMatchingCatch= function(e, catchIdx) {
    var errDcl = testCase.commands[ localIdx(catchIdx) ].target;
    if (!errDcl) {
      return true; // no error specified means catch all errors
    }
    var errExpr = this.evalWithExpandedStoredVars(errDcl);
    var errMsg = e.message;
    if (errExpr.constructor && errExpr.constructor.name==='RegExp') {
      return (errMsg.match(errExpr));
    }
    return (errMsg.indexOf(errExpr) !== -1);
  };

  // unwind the blockStack, and callStack (ie, aborting functions), until reaching the given criteria
  function bubbleToTryBlock(_hasCriteria) {
    if ($$.tcf.nestingLevel < 0) {
      $$.LOG.warn("bubbleToTryBlock() called outside of any try nesting");
    }
    var tryState = unwindToBlock(_hasCriteria);
    while (!tryState && $$.tcf.nestingLevel > -1 && callStack.length > 1) {
      var callFrame = callStack.pop();
      $$.LOG.info("function '" + callFrame.name + "' aborting due to error");
      restoreVarState(callFrame.savedVars);
      tryState = unwindToBlock(_hasCriteria);
    }
    return tryState;
  }

  // unwind the blockStack until reaching the given criteria
  function unwindToBlock(_hasCriteria) {
    var tryState = activeBlockStack().unwindTo(_hasCriteria);
    if (tryState) {
      $$.LOG.debug("unwound to: " + fmtTry(tryState));
    }
    return tryState;
  }

  // resume or conclude command/error bubbling
  Selenium.prototype.reBubble= function() {
    if ($$.tcf.bubbling.mode === "error") {
      if ($$.tcf.nestingLevel > -1) {
        $$.LOG.debug("error-bubbling continuing...");
        this.handleCommandError($$.tcf.bubbling.error);
      }
      else {
        $$.LOG.error("Error was not caught: '" + $$.tcf.bubbling.error.message + "'");
        try { throw $$.tcf.bubbling.error; }
        finally { $$.tcf.bubbling = null; }
      }
    }
    else { // mode == "command"
      if (isBubblable()) {
        $$.LOG.debug("command-bubbling continuing...");
        this.bubbleCommand($$.tcf.bubbling.srcIdx, $$.tcf.bubbling._isStopCriteria);
      }
      else {
        $$.LOG.info("command-bubbling complete - suspended command executing now " + fmtCmdRef($$.tcf.bubbling.srcIdx));
        setNextCommand($$.tcf.bubbling.srcIdx);
        $$.tcf.bubbling = null;
      }
    }
  };

  // instigate or transform bubbling, as appropriate
  Selenium.prototype.transitionBubbling= function(_isContextBlockType)
  {
    if ($$.tcf.bubbling) { // transform bubbling
      if ($$.tcf.bubbling.mode === "error") {
        $$.LOG.debug("Bubbling error: '" + $$.tcf.bubbling.error.message + "'"
          + ", replaced with command " + fmtCmdRef(idxHere()));
        $$.tcf.bubbling = { mode: "command", srcIdx: idxHere(), _isStopCriteria: _isContextBlockType };
        return true;
      }
      // mode == "command"
      $$.LOG.debug("Command suspension " + fmtCmdRef($$.tcf.bubbling.srcIdx)
        + ", replaced with " + fmtCmdRef(idxHere()));
      $$.tcf.bubbling.srcIdx = idxHere();
      return true;
    }
    if (isBubblable(_isContextBlockType)) { // instigate bubbling
      this.bubbleCommand(idxHere(), _isContextBlockType);
      return true;
    }
    // no change to bubbling
    return false;
  };

  // determine if bubbling is possible from this point outward
  function isBubblable(_isContextBlockType) {
    var canBubble = ($$.tcf.nestingLevel > -1);
    if (canBubble) {
      var blkState = activeBlockStack().findEnclosing(isTryOrContextBlockType);
      return (blkDefFor(blkState).nature === "try");
    }
    return canBubble;

    //- determine if stackFrame is a try-block or the given type of block
    function isTryOrContextBlockType(stackFrame) {
      if (_isContextBlockType && _isContextBlockType(stackFrame)) {
        return true;
      }
      return Stack.isTryBlock(stackFrame);
    }
  }

  function hasUnspentCatch(tryState) {
    return (blkDefFor(tryState).catchIdx && !tryState.hasCaught);
  }
  function hasUnspentFinally(tryState) {
    return (blkDefFor(tryState).finallyIdx && !tryState.hasFinaled);
  }

  function fmtTry(tryState)
  {
    var tryDef = blkDefFor(tryState);
    return (
      (tryDef.name ? "try '" + tryDef.name + "' " : "")
      + "@" + (tryState.idx+1)
      + ", " + tryState.execPhase + ".."
      + " " + $$.tcf.nestingLevel + "n"
    );
  }

  function fmtCatching(tryState)
  {
    if (!tryState) {
      return "";
    }
    var bbl = "";
    if ($$.tcf.bubbling) {
      bbl = "@" + ($$.tcf.bubbling.srcIdx+1) + " ";
    }
    var tryDef = blkDefFor(tryState);
    var catchDcl = testCase.commands[ localIdx(tryDef.catchIdx) ].target;
    return " :: " + bbl + catchDcl;
  }
  
  // ================================================================================
  Selenium.prototype.doWhile = function(condExpr)
  {
    var self= this;
    enterLoop(
      function() {    // validate
          assert(condExpr, " 'while' requires a condition expression.");
          self.assertCompilable("", condExpr, ";", "Invalid condition");
          return null;
      }
      ,function() { } // initialize
      ,function() { return (self.evalWithExpandedStoredVars(condExpr)); } // continue?
      ,function() { } // iterate
    );
  };
  Selenium.prototype.doEndWhile = function() {
    iterateLoop();
  };

  // ================================================================================
  Selenium.prototype.doFor = function(forSpec)
  {
    var self= this;
    enterLoop(
      function(loop) { // validate
          assert(forSpec, " 'for' requires: <initial-val>; <condition>; <iter-stmt>.");
          self.assertCompilable("for ( ", forSpec, " );", "Invalid loop parameters");
          var specs = iexpr.splitList(forSpec, ";");
          assert(specs.length === 3, " 'for' requires <init-stmt>; <condition>; <iter-stmt>.");
          loop.initStmt = specs[0];
          loop.condExpr = specs[1];
          loop.iterStmt = specs[2];
          var localVarNames = parseVarNames(loop.initStmt);
          $$.LOG.debug("localVarNames: " + localVarNames.join(','));
          for( var i=0; i<localVarNames.length; i++ ) { //@TODO  for(.. of..) loop once NetBeans support it.
              var variableName= localVarNames[i];
              variableName.length>1 && variableName[0]==='$' || notifyFatal( 'For loop ' +(i+1)+ 'th variable name must start with $ and have at least two characters.' );
              validateName( variableName.substring(1), 'For loop ' +(i+1)+ 'th variable name' );
          }
          return localVarNames;
      }
      ,function(loop) { self.evalWithExpandedStoredVars(loop.initStmt); }          // initialize
      ,function(loop) { return self.evalWithExpandedStoredVars(loop.condExpr); } // continue?
      ,function(loop) { self.evalWithExpandedStoredVars(loop.iterStmt); }          // iterate
    );
  };
  Selenium.prototype.doEndFor = function() {
    iterateLoop();
  };

  function parseVarNames(initStmt) {
    var varNames = [];
    if (initStmt) {
      var vInits = iexpr.splitList(initStmt, ",");
      var i;
      for (i = 0; i < vInits.length; i++) {
        var vInit = iexpr.splitList(vInits[i], "=");
        varNames.push(vInit[0]);
      }
    }
    return varNames;
  }
  
  // ================================================================================
  Selenium.prototype.doForeach = function(varName, valueExpr)
  {
    var self= this;
    enterLoop(
      function(loop) { // validate
          assert(varName, " 'foreach' requires a variable name.");
          assert(valueExpr, " 'foreach' requires comma-separated values.");
          self.assertCompilable("[ ", valueExpr, " ];", "Invalid value list");
          loop.values = self.evalWithExpandedStoredVars("[" + valueExpr + "]");
          if (loop.values.length === 1 && Array.isArray(loop.values[0])) {
            loop.values = loop.values[0]; // if sole element is an array, than use it
          }
          return [varName, "_i"];
      }
      ,function(loop) { loop.i = 0; storedVars[varName] = loop.values[loop.i]; }       // initialize
      ,function(loop) { storedVars._i = loop.i; return (loop.i < loop.values.length);} // continue?
      ,function(loop) { // iterate
          if (++(loop.i) < loop.values.length) {
            storedVars[varName] = loop.values[loop.i];
          }
      }
    );
  };
  Selenium.prototype.doEndForeach = function() {
    iterateLoop();
  };
  // ================================================================================
  Selenium.prototype.doLoadJsonVars = function(filepath, selector)
  {
    assert(filepath, " Requires a JSON file path or URL.");
    var jsonReader = new JSONReader(filepath);
    this.loadVars(jsonReader, "JSON object", filepath, selector);
  };
  Selenium.prototype.doLoadXmlVars = function(filepath, selector)
  {
    assert(filepath, " Requires an XML file path or URL.");
    var xmlReader = new XmlReader(filepath);
    this.loadVars(xmlReader, "XML element", filepath, selector);
  };
  Selenium.prototype.doLoadVars = function(filepath, selector)
  {
    $$.LOG.warn("The loadVars command has been deprecated and will be removed in future releases."
      + " Please use doLoadXmlVars instead.");
    Selenium.prototype.doLoadXmlVars(filepath, selector);
  };

  Selenium.prototype.loadVars= function(reader, desc, filepath, selector)
  {
    if (selector) {
      assertCompilable("", selector, ";", "Invalid selector condition");
    }
    reader.load(filepath);
    reader.next(); // read first varset and set values on storedVars
    if (!selector && !reader.EOF()) {
      notifyFatalHere(" Multiple " + desc + "s are not valid for this command."
        + ' (A specific ' + desc + ' can be selected by specifying: name="value".)');
    }

    var result = this.evalWithExpandedStoredVars(selector);
    if (typeof result !== "boolean") {
      notifyFatalHere(", " + selector + " is not a boolean expression");
    }

    // read until specified set found
    var isEof = reader.EOF();
    while (!isEof && this.evalWithExpandedStoredVars(selector) !== true) {
      reader.next(); // read next varset and set values on storedVars
      isEof = reader.EOF();
    } 

    if (!this.evalWithExpandedStoredVars(selector)) {
      notifyFatalHere(desc + " not found for selector expression: " + selector
        + "; in input file " + filepath);
    }
  };


  // ================================================================================
  Selenium.prototype.doForJson = function(jsonpath)
  {
    enterLoop(
      function(loop) {  // validate
          assert(jsonpath, " Requires a JSON file path or URL.");
          loop.jsonReader = new JSONReader();
          var localVarNames = loop.jsonReader.load(jsonpath);
          return localVarNames;
      }
      ,function() { }   // initialize
      ,function(loop) { // continue?
          var isEof = loop.jsonReader.EOF();
          if (!isEof) { loop.jsonReader.next(); }
          return !isEof;
      }
      ,function() { }
    );
  };
  Selenium.prototype.doEndForJson = function() {
    iterateLoop();
  };

  Selenium.prototype.doForXml = function(xmlpath)
  {
    enterLoop(
      function(loop) {  // validate
          assert(xmlpath, " 'forXml' requires an XML file path or URL.");
          loop.xmlReader = new XmlReader();
          var localVarNames = loop.xmlReader.load(xmlpath);
          return localVarNames;
      }
      ,function() { }   // initialize
      ,function(loop) { // continue?
          var isEof = loop.xmlReader.EOF();
          if (!isEof) { loop.xmlReader.next(); }
          return !isEof;
      }
      ,function() { }
    );
  };
  Selenium.prototype.doEndForXml = function() {
    iterateLoop();
  };



  // --------------------------------------------------------------------------------
  // Note: Selenium variable expansion occurs before command processing, therefore we re-execute
  // commands that *may* contain ${} variables. Bottom line, we can't just keep a copy
  // of parameters and then iterate back to the first command inside the body of a loop.

  function enterLoop(_validateFunc, _initFunc, _condFunc, _iterFunc)
  {
    assertRunning();
    var loopState;
    if (!activeBlockStack().isHere()) {
      // loop begins
      loopState = { idx: idxHere() };
      activeBlockStack().push(loopState);
      var localVars = _validateFunc(loopState);
      loopState.savedVars = getVarState(localVars);
      initVarState(localVars); // because with-scope can reference storedVars only once they exist
      _initFunc(loopState);
    }
    else {
      // iteration
      loopState = activeBlockStack().top();
      _iterFunc(loopState);
    }

    if (!_condFunc(loopState)) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into body of loop
  }
  function iterateLoop()
  {
    assertRunning();
    assertActiveScope(blkDefHere().beginIdx);
    var loopState = activeBlockStack().top();
    if (loopState.isComplete) {
      restoreVarState(loopState.savedVars);
      activeBlockStack().pop();
      // done, fall out of loop
    }
    else {
      // jump back to top of loop
      setNextCommand(blkDefHere().beginIdx);
    }
  }

  // ================================================================================
  Selenium.prototype.doContinue = function(condExpr) {
    var loopState = this.dropToLoop(condExpr);
    if (loopState) {
      // jump back to top of loop for next iteration, if any
      var endCmd = blkDefFor(loopState);
      setNextCommand(blkDefAt(endCmd.endIdx).beginIdx);
    }
  };
  Selenium.prototype.doBreak = function(condExpr) {
    var loopState = this.dropToLoop(condExpr);
    if (loopState) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefFor(loopState).endIdx);
    }
  };

  // Unwind the command stack to the inner-most active loop block
  // (unless the optional condition evaluates to false)
  Selenium.prototype.dropToLoop= function(condExpr)
  {
    assertRunning();
    if (condExpr) {
      assertCompilable("", condExpr, ";", "Invalid condition");
    }
    if (this.transitionBubbling(Stack.isLoopBlock)) {
      return;
    }
    if (condExpr && !this.evalWithExpandedStoredVars(condExpr)) {
      return;
    }
    var loopState = activeBlockStack().unwindTo(Stack.isLoopBlock);
    return loopState;
  };


  // ================================================================================
  Selenium.prototype.doCall = function(funcName, argSpec)
  {
    var loop = currentTest || htmlTestRunner.currentTest; // See Selenium.prototype.doRollup()
    assertRunning(); // TBD: can we do single execution, ie, run from this point then break on return?
    if (argSpec) {
      this.assertCompilable("var ", argSpec, ";", "Invalid call parameter(s)");
    }
    var funcIdx = symbols[funcName];
    assert(funcIdx, " Function does not exist: " + funcName + ".");

    var activeCallFrame = callStack.top();
    if (activeCallFrame.isReturning && activeCallFrame.returnIdx === idxHere()) {
      // returning from completed function
      var popped= callStack.pop();
      loop.commandError= popped.originalCommandError;
      var _result= storedVars._result;
      storedVars= popped.savedVars; //restoreVarState( popped.savedVars );
      storedVars._result= _result;
      assert( testCase==popped.testCase, "The popped testCase is different." ); // Not sure why, but this seems to be true.
    }
    else {
      // Support $stored-variablename, just like string{} and getQs, storeQs...
      argSpec= expandStoredVars(argSpec);
      // save existing variable state and set args as local variables
      var args = this.parseArgs(argSpec);
      var savedVars= storedVars; //var savedVars = getVarStateFor(args);
      storedVars= args; //args= setVars(args);

      var originalCommandError= loop.commandError;
      // There can be several cascading layers of these calls - one per function call level.
      loop.commandError= function( result ) {
          var popped= callStack.pop();
          this.commandError= popped.originalCommandError;
            var _result= storedVars._result;
            storedVars= popped.savedVars; //restoreVarState( popped.savedVars );
            storedVars._result= _result;
          testCase= popped.testCase;
          testCase.debugContext.testCase= testCase;
          editor.selDebugger.pause();
          //selenium.reset(); // This doesn't help

          originalCommandError.call( this, result ); // I've restored this.commandError *before* calling originalCommandError(), because if this was a deeper function call then originalCommandError() will restore any previous version of this.commandError, and I don't want to step on its feet here
          //@TODO setNextCommand(??)??
      };
        
      callStack.push( {
          funcIdx: funcIdx,
          name: funcName,
          args: args,
          returnIdx: idxHere(),
          savedVars: savedVars,
          blockStack: new Stack(),
          testCase: testCase,
          originalCommandError: originalCommandError
      });
      // jump to function body
      setNextCommand(funcIdx);
    }
  };
  Selenium.prototype.doFunction = function(funcName)
  {
    assertRunning();

    var funcDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx === idxHere()) {
      //SelBlocks used to call setVars(activeCallFrame.args); here. But this was already handled in doCall().
    }
    else {
      // no active call, skip around function body
      setNextCommand(funcDef.endIdx);
    }
  };
  Selenium.prototype.doReturn = function(value) {
    this.returnFromFunction(null, value);
  };
  Selenium.prototype.doEndFunction = function(funcName) {
    this.returnFromFunction(funcName);
  };
  Selenium.prototype.doEndScript = function(scrName) {
    this.returnFromFunction(scrName);
  };

  Selenium.prototype.returnFromFunction= function(funcName, returnVal)
  {
    assertRunning();
    if (this.transitionBubbling(Stack.isFunctionBlock)) {
      return;
    }
    var endDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx !== endDef.funcIdx) {
      // no active call, we're just skipping around a function block
    }
    else {
      if (returnVal) { storedVars._result = this.evalWithExpandedStoredVars(returnVal); }
      activeCallFrame.isReturning = true;
      // jump back to call command
      setNextCommand(activeCallFrame.returnIdx);
    }
  };


  // ================================================================================
  Selenium.prototype.doExitTest = function() {
    if (this.transitionBubbling()) {
      return;
    }
    // intercept command processing and simply stop test execution instead of executing the next command
    $$.fn.interceptOnce(editor.selDebugger.runner.IDETestLoop.prototype, "resume", $$.handleAsExitTest);
  };


  // ========= storedVars management =========
    // SelBlocksGlobal: This is used instead of SelBlocks' evalWithVars(expr)
    Selenium.prototype.evalWithExpandedStoredVars= function(expr) {
      try {
        typeof expr==='string' || expr===undefined || SeLiteMisc.fail( 'expr must be a string or undefined' );
        var expanded= expr!==undefined
            ? expandStoredVars(expr)
            : undefined;
        LOG.debug( 'Selenium.prototype.evalWithExpandedStoredVars(): ' +expr+ ' expanded to: ' +expanded );
        var window = this.browserbot.getCurrentWindow();
        // Firefox eval() doesn't return values of some expression strings, including
        // '{field: "value"}' and 'return {field: "value"}'. That's why I assign to local variable 'evalWithExpandedStoredVarsResult' first, and then I return it.
        // EXTENSION REVIEWERS: Use of eval is consistent with the Selenium extension itself.
        // Scripted expressions run in the Selenium window, isolated from any web content.
        var result = eval( "var evalWithExpandedStoredVarsResult= " +expanded+ "; evalWithExpandedStoredVarsResult" );
        LOG.debug( 'result: ' +typeof result+ ': ' +SeLiteMisc.objectToString(result, 2) );
        return result;
      }
      catch (err) {
        notifyFatalErr(" While evaluating Javascript expression: " + expr+ " expanded as " +expanded, err);
      }
    };
    
  // This is not related to parseArgs(str) in chrome/content/selenium-core/test/RemoteRunnerTest.js
  Selenium.prototype.parseArgs= function(argSpec) { // comma-sep -> new prop-set
    var args = {};
    /* @TODO check & document whether I need to care about string{} here. Maybe just don't support string{...} for 'call' command - it wouldn't make sense for 'call' anyway. $variableName should work for 'call' without using string{...}. 'call' works with string{..}, but it's not recommended for now.

    @TODO See preprocessParameter() in this file.

    // Split argSpec if it is in format fieldA=valueA,fieldB=..string{...},fieldC=..string{..},..
    // This regex allows parameter values within string{..} to contain commas or assignment =.
    // The values within string{...} can't contain curly brackets { and }.
    // @TODO Also support commas within '' or ""? But for now using string{} is a workaround.

    // This regex is optimistic - assuming that argSpec is well-formed
    var spacedRegex= /=\s*([^q][^,]*|string{{[^}]*)\}?\s*,?/;
    var regex= new RegExp( spacedRegex.source.replace( / /g, '') );

    var parms= argSpec.split( regex );
    // The last item in parms[] is an odd empty string, which I ignore
    for( var i = 0; i < parms.length-1; i+=2 ) {
      var key= parms[i].trim();
      var value = parms[i+1];
      if( value.substr(0, 7)==='string{' ) {
          value= value.substr( 7 );
      }
      if( typeof value !=='string' ) {
          // @TODO Log an error instead of an alert:
          alert( 'param ' +key+ ' has value (to evaluate): ' +value+ ' with constructor ' +value.constructor.name );
          // For some reason, LOG.debug() doesn't work here.
      }
      args[ key ] = this.evalWithExpandedStoredVars( value ); // This would fail, since parseArgs() is not a member of Selenium.prototype
    }
    return args;/**/
    // original from SelBlocks:
    var parms = iexpr.splitList(argSpec, ",");
    // var parms = argSpec.split(","); //before SelBlocks 2
    for (var i = 0; i < parms.length; i++) {
      // var keyValue = parms[i].split("="); //before SelBlocks 2
      var keyValue = iexpr.splitList(parms[i], "=");
      validateName(keyValue[0], "parameter");
      args[ keyValue[0].trim() ] = this.evalWithExpandedStoredVars(keyValue[1]);
    }
    return args;
  };
  function initVarState(names) { // new -> storedVars(names)
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        if (!storedVars[names[i]]) {
          storedVars[names[i]] = null;
        }
      }
    }
  }
  function getVarStateFor(args) { // storedVars(prop-set) -> new prop-set
    var savedVars = {};
    var varname;
    for (varname in args) {
      savedVars[varname] = storedVars[varname];
    }
    return savedVars;
  }
  function getVarState(names) { // storedVars(names) -> new prop-set
    var savedVars = {};
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        savedVars[names[i]] = storedVars[names[i]];
      }
    }
    return savedVars;
  }
  function setVars(args) { // prop-set -> storedVars
    var varname;
    for (varname in args) {
      storedVars[varname] = args[varname];
    }
  }
  function restoreVarState(savedVars) { // prop-set --> storedVars
    var varname;
    for (varname in savedVars) {
      if (savedVars[varname] === undefined) {
        delete storedVars[varname];
      }
      else {
        storedVars[varname] = savedVars[varname];
      }
    }
  }

  // ========= error handling =========

  function SelblocksError(idx, message) {
    this.name = "SelblocksError";
    this.message = (message || "");
    this.idx = idx;
  }
  SelblocksError.prototype = Error.prototype;

  // TBD: make into throwable Errors
  function notifyFatalErr(msg, err) {
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  }
  function notifyFatal(msg) {
    var err = new Error(msg);
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  }
  function notifyFatalCmdRef(idx, msg) { notifyFatal(fmtCmdRef(idx) + msg); }
  function notifyFatalHere(msg) {
    // This may be called before testCase is set
    var commandRef;
    if( testCase===undefined ) {
      commandRef= 'unknown step: ';
      }
    else {
      // SelBlocks used fmtCurCmd() here. However, this
      // may be called right after TestCaseDebugContext's nextCommand(), which (as intercepted by SelBlocksGlobal) sets testCase.debugContext.debugIndex to -1. Then
      // fmtCurCmd() would fail (as it invokes idxHere() -> globIdx(-1).
      var stepLocalIdx= localIdxHere();
      commandRef= fmtCmdRef( globIdx( Math.max(stepLocalIdx, 0) ) )+ ': ';
    }
    notifyFatal( commandRef+msg );
  }

  function assertCmd(idx, cond, msg) { if (!cond) { notifyFatalCmdRef(idx, msg); } }
  function assert(cond, msg)         { if (!cond) { notifyFatalHere(msg); } }
  // TBD: can we at least show result of expressions?
  function assertRunning() {
    assert(testCase.debugContext.started, " Command is only valid in a running script,"
        + " i.e., cannot be executed via double-click, or via 'Execute this command'.");
  }
  function assertActiveScope(expectedIdx) {
    var activeIdx = activeBlockStack().top().idx;
    assert(activeIdx === expectedIdx, " unexpected command, active command was " + fmtCmdRef(activeIdx));
  }

  Selenium.prototype.assertCompilable= function(left, stmt, right, explanation) {
    try {
      this.evalWithExpandedStoredVars("function selblocksTemp() { " + left + stmt + right + " }");
    }
    catch (e) {
      throw new SyntaxError(fmtCmdRef(idxHere()) + " " + explanation + " '" + stmt +  "': " + e.message);
    }
  };

  function fmtCurCmd() {
    return fmtCmdRef(idxHere());
  }
  function fmtCmdRef(idx) {
    var test= localCase(idx);
    var commandIdx= localIdx(idx);

    return "@" +test.filename+ ': ' +(commandIdx+1) + ": " + fmtCommand( test.commands[commandIdx] );
  }
  function fmtCommand(cmd) {
    var c = cmd.command;
    if (cmd.target) { c += "|" + cmd.target; }
    if (cmd.value)  { c += "|" + cmd.value; }
    return '[' + c + ']';
  }

  //================= Utils ===============

  // Elapsed time, optional duration provides expiration
  function IntervalTimer(msDuration) {
    this.msStart = +new Date();
    this.getElapsed = function() { return (+new Date() - this.msStart); };
    this.hasExpired = function() { return (msDuration && this.getElapsed() > msDuration); };
    this.reset = function() { this.msStart = +new Date(); };
  }

  // produce an iterator object for the given array
  function arrayIterator(arrayObject) {
    return new function(ary) {
      var cur = 0;
      this.hasNext = function() { return (cur < ary.length); };
      this.next = function() { if (this.hasNext()) { return ary[cur++]; } };
    }(arrayObject);
  };

  // ==================== Data Files ====================
  // Adapted from the datadriven plugin
  // http://web.archive.org/web/20120928080130/http://wiki.openqa.org/display/SEL/datadriven

  function XmlReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load XML file and return the list of var names found in the first <VARS> element
    this.load = function(filepath)
    {
      var fileReader = new FileReader();
      var fileUrl = urlFor(filepath);
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl);
      $$.LOG.info("Reading from: " + fileUrl);

      var fileObj = xmlHttpReq.responseXML; // XML DOM
      varsets = fileObj.getElementsByTagName("vars"); // HTMLCollection
      if (varsets === null || varsets.length === 0) {
        throw new Error("A <vars> element could not be loaded, or <testdata> was empty.");
      }

      curVars = 0;
      varNames = attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function()
    {
      if (this.EOF()) {
        $$.LOG.error("No more <vars> elements to read after element #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + serializeXml(varsets[curVars]));  // log each name & value

      var expected = countAttrs(varsets[0]);
      var found = countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each <vars> element must have the same set of attributes."
        );
      }
      setupStoredVars(varsets[curVars]);
      curVars++;
    };

    //- retrieve the names of each attribute on the given XML node
    function attrNamesFor(node) {
      var attrNames = [];
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        attrNames.push(varAttrs[v].nodeName);
      }
      return attrNames;
    }

    //- determine how many attributes are present on the given node
    function countAttrs(node) {
      return node.attributes.length;
    }

    //- set selenium variables from given XML attributes
    function setupStoredVars(node) {
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        var attr = varAttrs[v];
        if (null === varsets[0].getAttribute(attr.nodeName)) {
          throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
            + "; found attribute " + attr.nodeName + ", which does not appear in the first <vars> element."
            + " Each <vars> element must have the same set of attributes."
          );
        }
        storedVars[attr.nodeName] = attr.nodeValue;
      }
    }

    //- format the given XML node for display
    function serializeXml(node) {
      if (XMLSerializer !== "undefined") {
        return (new XMLSerializer()).serializeToString(node) ;
      }
      if (node.xml) { return node.xml; }
      throw "XMLSerializer is not supported or can't serialize " + node;
    }
  }


  function JSONReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load JSON file and return the list of var names found in the first object
    this.load = function(filepath)
    {
      var fileReader = new FileReader();
      var fileUrl = urlFor(filepath);
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl);
      $$.LOG.info("Reading from: " + fileUrl);

      var fileObj = xmlHttpReq.responseText;
      varsets = eval(fileObj);
      if (varsets === null || varsets.length === 0) {
        throw new Error("A JSON object could not be loaded, or the file was empty.");
      }

      curVars = 0;
      varNames = attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function()
    {
      if (this.EOF()) {
        $$.LOG.error("No more JSON objects to read after object #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + serializeJson(varsets[curVars]));  // log each name & value

      var expected = countAttrs(varsets[0]);
      var found = countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent JSON object #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each JSON object must have the same set of attributes."
        );
      }
      setupStoredVars(varsets[curVars]);
      curVars++;
    };

    //- retrieve the names of each attribute on the given object
    function attrNamesFor(obj) {
      var attrNames = [];
      var attrName;
      for (attrName in obj) {
        attrNames.push(attrName);
      }
      return attrNames;
    }

    //- determine how many attributes are present on the given obj
    function countAttrs(obj) {
      var n = 0;
      var attrName;
      for (attrName in obj) {
        n++;
      }
      return n;
    }

    //- set selenium variables from given JSON attributes
    function setupStoredVars(obj) {
      var attrName;
      for (attrName in obj) {
        if (null === varsets[0][attrName]) {
          throw new Error("Inconsistent JSON at object #" + varsetIdx
            + "; found attribute " + attrName + ", which does not appear in the first JSON object."
            + " Each JSON object must have the same set of attributes."
          );
        }
        storedVars[attrName] = obj[attrName];
      }
    }

    //- format the given JSON object for display
    function serializeJson(obj) {
      var json = uneval(obj);
      return json.substring(1, json.length-1);
    }
  }

  function urlFor(filepath) {
    var URL_PFX = "file://";
    var url = filepath;
    if (filepath.substring(0, URL_PFX.length).toLowerCase() !== URL_PFX) {
      testCasePath = testCase.file.path.replace("\\", "/", "g");
      var i = testCasePath.lastIndexOf("/");
      url = URL_PFX + testCasePath.substr(0, i) + "/" + filepath;
    }
    return url;
  }


  // ==================== File Reader ====================
  // Adapted from the include4ide plugin

  function FileReader() {}

  FileReader.prototype.prepareUrl = function(url) {
    var absUrl;
    // htmlSuite mode of SRC? TODO is there a better way to decide whether in SRC mode?
    if (window.location.href.indexOf("selenium-server") >= 0) {
      $$.LOG.debug("FileReader() is running in SRC mode");
      absUrl = absolutify(url, htmlTestRunner.controlPanel.getTestSuiteName());
    } else {
      absUrl = absolutify(url, selenium.browserbot.baseUrl);
    }
    $$.LOG.debug("FileReader() using URL to get file '" + absUrl + "'");
    return absUrl;
  };

  FileReader.prototype.getDocumentSynchronous = function(url) {
    var absUrl = this.prepareUrl(url);
    var requester = this.newXMLHttpRequest();
    if (!requester) {
      throw new Error("XMLHttp requester object not initialized");
    }
    requester.open("GET", absUrl, false); // synchronous (we don't want selenium to go ahead)
    try {
      requester.send(null);
    } catch(e) {
      throw new Error("Error while fetching URL '" + absUrl + "':: " + e);
    }
    if (requester.status !== 200 && requester.status !== 0) {
      throw new Error("Error while fetching " + absUrl
        + " server response has status = " + requester.status + ", " + requester.statusText );
    }
    return requester;
  };

  FileReader.prototype.newXMLHttpRequest = function() {
    var requester = 0;
    try {
      // for IE/ActiveX
      if (window.ActiveXObject) {
        try {       requester = new ActiveXObject("Msxml2.XMLHTTP"); }
        catch(ee) { requester = new ActiveXObject("Microsoft.XMLHTTP"); }
      }
      // Native XMLHttp
      else if (window.XMLHttpRequest) {
        requester = new XMLHttpRequest();
      }
    }
    catch(e) {
      throw new Error("Your browser has to support XMLHttpRequest in order to read data files\n" + e);
    }
    return requester;
  };

}(selblocks));

(function() {
    var originalPreprocessParameter= Selenium.prototype.preprocessParameter;
    // This sets a head intercept of chrome/content/selenium-core/scripts/selenium-api.js
    // This adds support for
    // - quick object notation using object{ field: value... } - that can't be mixed with anything else in the value,
    // it must be the only content passed as a value of a Se IDE command parameter
    // - 'Quick Stored' - string{javascript-expression-here with $stored-var-name support}
    // and any-prefixstring{expression}postfix (including variations with empty prefix/postfix: any-prefixstring{expression} or string{expression}postfix or string{expression}).
    // Prefix and Postfix must not contain characters { and }. Prefix must not contain character = so that we
    // can use string{} in parameter values for SelBlocks' action call (string{} in a parameter value there doesn't allow any prefix/postfix).
    Selenium.prototype.preprocessParameter = function(value) {
        // @TODO @TODO @TODO Do we need string{..} at all? Standard Se preprocessParameter() supports multiple ${...} for stored vars.
        // string{} was intended only so that there can be prefix and/or postfix around it: prefix... string{expression} postfix...
        // But that can be accomplished with javascript{ 'prefix...' +(expression)+ 'postfix...' }
        // But javascript{..} doesn't replace ${variableName}.
        // Either way, replacing stored variables within Javascript statements/selectors using ${...}
        // may confuse users, if the variable has a string value, because ${...} gets replaced by the value of the variable
        // - they would need to put apostrophes around it (for XPath), or quotes/apostrophes around it (for Javascript).
        // Selenese ${variableName} requires {}, which is good because it separates it from the rest of the target/value,
        // so it's robust yet easy to use.
        // string{ ... $xxx ... } replaces $xxx by the symbol/reference to the stored variable, so its typed and it doesn't need to be quote
        // (unless you're passing it to XPath).
        // 
        // string{ ... ${...} .... } doesn't work. No sure there's a need for it. If it worked substitituing as in other Selenese,
        // it could involve unexpected errors if ${variableName} were a number and later it would become a non-numeric string
        // and if there were no quotes/apostrophes around it.
        
        /** string{} - evaluate the expression and cast it as a string. Access stored variables using $xyz. If the stored
            variable is an object/array, you can access its fields - i.e. $object-var-name.fieldXYZ or $array-var-name[index].
           string{} transforms the evaluated result into a string. This way we can use it with standard Se actions
           click/select/type, even if the evaluated value is a number.
           That limits the usage of string{}: you normally don't want string{} to yield an object/array. For such cases use object{...} or array[...]. E.g. passing an
             object as the second parameter to 'typeRandom' action (function doTypeRandom).
        */
        LOG.debug('SelBlocksGlobal tail override of preprocessParameter(): ' +value );
        // Match object{..} and evaluate as a definition of anonymous Javascript object. Replace $... parts with respective stored variables. There can be no prefix or postfix before/after eval{ and }.
        var match= value.match( /^\s*object(\{(.|\r?\n)+\})\s*$/ );
        if( match ) {
            return this.evalWithExpandedStoredVars( match[1] );
        }
        // Match array[...] and evaluate it as an array of Javascript expressions. Replace $... parts with respective stored variables. There can be no prefix or postfix before/after eval{ and }.
        var match= value.match( /^\s*array(\[(.|\r?\n)+\])\s*$/ );
        if( match ) {
            return this.evalWithExpandedStoredVars( match[1] );
        }
        // Match eval{...} and evaluate it as a Javascript expression. Replace $... parts with respective stored variables. There can be no prefix or postfix before/after eval{ and }.
        var match= value.match( /^\s*eval\{((.|\r?\n)+)\}\s*$/ );
        if( match ) {
            return this.evalWithExpandedStoredVars( match[1] );
        }
        // Match ...string{...}....  Evaluate it as a string with an optional prefix and postfix, replace $... part(s) with respective stored variables.
        // Spaces in the following regex are here only to make it more readable; they get removed.
        var spacedRegex= /^ ( ((?!string\{).)* )  string\{((.|\r?\n)+)\}  (([^}])*)$/;
        var regex= new RegExp( spacedRegex.source.replace( / /g, '') );
        match = value.match( regex );
        if( match ) {
            var prefix= match[1];
            var mainPart= match[3];
            var postfix= match[5];
            LOG.debug( 'string{}: ' +
                (prefix!=='' ? 'prefix: '+prefix+', ' : '')+
                'mainPart: ' +mainPart+
                (postfix!=='' ? ', postfix: '+postfix : '')
            );
            var evalResult= this.evalWithExpandedStoredVars( mainPart );

            if( evalResult!==null && evalResult!==undefined ) {
                evalResult= '' +evalResult;
            }
            else {
                evalResult= this.robustNullToken;//@TODO selite-misc-ide as a separate extension, or as a part of SelBlocks Global
            }
            LOG.debug( '...string{}... transformed to: ' +prefix+evalResult+postfix);
            return prefix+evalResult+postfix;
        }
        return originalPreprocessParameter.call( this, value );
    };
})();