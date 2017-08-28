var glob = require( 'glob' );
var path = require( 'path' );

var mobs = [];

glob.sync( './monsters/*.js' ).forEach( function( file ) {
  var temp = require( path.resolve( file ) );
  mobs = mobs.concat(temp);
});


module.exports = mobs;
