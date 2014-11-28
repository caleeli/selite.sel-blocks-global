// selbocks name-space
(function($$){
  // Based on a part of $$.handleAsTryBlock from SelBlocks
  $$.testLoopResumeHandleFailedResult= function testLoopResumeHandleFailedResult() {
      // Selenium IDE doesn't stop running on verifications. Therefore verifications shouldn't trigger 'catch' clause. However, we do suppress making the test case marked as failed, and we log at info level only.
      LOG.info( "try..catch..endTry suppressed verification failure from command: " + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |");
      this.result.failed= false;
      this.result.passed= true;
  };
  
  // Based on a part of $$.handleAsTryBlock from SelBlocks
  $$.testLoopResumeHandleError= function testLoopResumeHandleError( e ) {
      var originalMessage= e.message; // Selenium IDE generates 'false' message for failed assertions, and those then would only match catch | 'false' |. Following makes them catchable by the actual assertion message.
      if( e.message==='false' ) {
          e.message= this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |";
      }
      if( /*isManaged*/$$.fn.getInterceptTop() && $$.fn.getInterceptTop().attrs.handleError(e) ) {
        var message= originalMessage!=='false'
            ? '. The message: ' +originalMessage
            : '';
        LOG.info( 'try..catch..endTry caught an exception or assert failure from command: ' + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |" +message );   
        this.continueTest();
      } else {
        this._handleCommandError(e); // causes command to be marked in red
        this.testComplete();
      }
  };
  
  /* This function replaces native Selenium command handling while inside a try block.
   */
  $$.handleAsTryBlock = function()
  {
    try {
      selenium.browserbot.runScheduledPollers();
      this._executeCurrentCommand();
      if( this.result.failed ) {
          // Selenium IDE doesn't stop running on verifications. Therefore verifications shouldn't trigger 'catch' clause. However, we do suppress making the test case marked as failed, and we log at info level only.
          LOG.info( "try..catch..endTry suppressed verification failure from command: " + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |");
          this.result.failed= false;
          this.result.passed= true;
      }
      this.continueTestWhenConditionIsTrue();
    } catch (e) {
      var originalMessage= e.message; // Selenium IDE generates 'false' message for failed assertions, and those then would only match catch | 'false' |. Following makes them catchable by the actual assertion message.
      if( e.message==='false' ) {
          e.message= this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |";
      }
      if( /*isManaged*/$$.fn.getInterceptTop() && $$.fn.getInterceptTop().attrs.handleError(e) ) {
        var message= originalMessage!=='false'
            ? '. The message: ' +originalMessage
            : '';
        LOG.info( 'try..catch..endTry caught an exception or assert failure from command: ' + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |" +message );   
        this.continueTest();
      } else {
        this._handleCommandError(e); // causes command to be marked in red
        this.testComplete();
      }
    }
  };

}(selblocks));
