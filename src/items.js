var glob = require( 'glob' );
var path = require( 'path' );

var items = [];

glob.sync( './items/*.js' ).forEach( function( file ) {
  var temp = require( path.resolve( file ) );
  items = items.concat(temp);
});


module.exports = items;
