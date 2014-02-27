SeLiteExtensionSequencer.registerPlugin( {
    pluginId: 'selblocks-global@selite.googlecode.com',
    coreUrl: [
      'chrome://selite-selblocks-global/content/extensions/name-space.js',
      'chrome://selite-selblocks-global/content/extensions/logger.js',
      'chrome://selite-selblocks-global/content/extensions/function-intercepting.js',
      'chrome://selite-selblocks-global/content/extensions/xpath-processing.js',
      'chrome://selite-selblocks-global/content/extensions/expression-parser.js',
      'chrome://selite-selblocks-global/content/extensions/selenium-executionloop-handleAsExitTest.js',
      'chrome://selite-selblocks-global/content/extensions/selenium-executionloop-handleAsTryBlock.js',
      'chrome://selite-selblocks-global/content/extensions/selblocks.js'
    ],
    xmlUrl: 'chrome://selite-selblocks-global/content/reference.xml',
    requisitePlugins: {
        'testcase-debug-context@selite.googlecode.com': 'SeLite TestCase Debug Context',
        'misc@selite.googlecode.com': 'SeLite Miscellaneous'
    }
} );
