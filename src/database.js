
var MongoClient = require('mongodb').MongoClient;


module.exports = {
	loadRooms: function (callback) {
		console.log(process.env.DB_HOST);

		// construct URL,
		var baseURL = 'mongodb://';
		if(process.env.DB_USER){
			// local DB doesn't need use pass so we skip if undefined
			baseURL += process.env.DB_USER + ':' + process.env.DB_PASS + '@';
		}
		baseURL += process.env.DB_HOST;
		console.log(baseURL);
		MongoClient.connect(baseURL, function(err, db) {
			if(err) { return console.dir(err); }

			var collection = db.collection('rooms');

			collection.find().toArray(function(err, rooms) {
				callback(sortRooms(rooms));
			});
		});
	}
}

function sortRooms(rooms) {
	var areaTemplate = {
		name: '', // these two values are filled in futher down this function
		id: '', // blanks just so we can see them in the template
		type: 'city',
		levels: 'All',
		description: 'The first city.',
		reloads: 0,
		created: '',
		saved: '',
		author: 'Rocky',
		messages: [
			{msg: 'A cool breeze blows through the streets of Midgaard.'},
			{msg: 'The bustle of the city can be distracting. Keep an eye out for thieves.'}
		],
		respawnOn: 8,
		persistence: false,
		rooms: [

		]
	};

	var tempareas = {};
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		room.id = room._id.toString();
		room.playersInRoom = [];
		if (!tempareas[room.area]) {
			tempareas[room.area] = []

		}
		tempareas[room.area].push(room);
	}

	var output = []
	Object.keys(tempareas).forEach(function(key) {
		var currentRooms = tempareas[key];
		var area = {};
		Object.assign(area,areaTemplate);
		area.rooms = currentRooms;
		area.name = area.rooms[0].area;
		area.id = area.rooms[0].area;
		output.push(area);
	});
	return output;
};
