/*
* All non-combat commands that one would consider 'general' to a all
* users (like get, look, and movement). Anything combat (even potentially) related is in skills.js
* the actual combat loop is, of course, in combat.js.
* 
* Events fired on particular commands are also fired here; for example onEnter, onLeave
*/
'use strict';
var fs = require('fs'),
Character = require('./character').character,
World = require('./world').world,
Room = require('./rooms').room,
players = World.players,
time = World.time,
areas = World.areas,

Cmd = function () {};

/*
	command object = {
		cmd: cmdArr[0].toLowerCase(), // {cast} spark boar
		msg: cmdArr.slice(1).join(' '), // cast {spark boar}
		arg: cmdArr[1].toLowerCase(), // cast {spark} boar
		input: cmdArr.slice(2).join(' '), // cast spark {boar ...}
		number: 1 // argument target -- cast spark 2.boar
	};
*/
Cmd.prototype.createCommandObject = function(resFromClient) {
	var cmdArr = resFromClient.msg.split(' '),
	cmdObj = {};

	if (cmdArr.length === 1) {
		cmdArr[1] = '';
	}

	if (/[`~@#$%^&*()-+={}[]|<>]+$/g.test(resFromClient.msg) === false) {
		cmdObj = {
			cmd: cmdArr[0].toLowerCase(),
			msg: cmdArr.slice(1).join(' '),
			arg: cmdArr[1].toLowerCase(),
			input: cmdArr.slice(2).join(' '),
			number: 1
		};

		if (cmdObj.input && !isNaN(parseInt(cmdObj.input[0]))
			|| (!cmdObj.input && !isNaN(parseInt(cmdObj.msg[0]))) ) {

			cmdObj.arg = cmdObj.arg.replace(/.*[.]/g, '');
			cmdObj.number = parseInt(cmdObj.msg[0]);

			if (!cmdObj.input) {
				cmdObj.msg = cmdObj.msg.replace(/^[0-9][.]/, '');
			} else {
				cmdObj.input = cmdObj.input.replace(/^[0-9][.]/, '');
			}
		}
	}

	return cmdObj;
};
// Puts any target object into a defined room after verifying criteria
Cmd.prototype.move = function(target, command, fn) {
	var cmd = this,
	direction = command.arg,
	dexMod = World.dice.getDexMod(target),
	exitObj,
	displayHTML,
	targetRoom,
	exitObj,
	sneakAff,
	roomObj,
	canEnter = true, // event result, must be true to move into targetRoom
	canLeave = true, // event result, must be true to leave roomObj	
	i = 0,
	cost = 3,
	parseMovementMsg = function(exitObj) {
		if (!exitObj.cmdMsg) {
			if (exitObj.cmd === 'up') {
				return 'below';
			} else if (exitObj.cmd === 'down') {
				return 'above';
			} else {
				return ' the ' + exitObj.cmd;
			}
		} else {
			return exitObj.cmdMsg;
		}
	};

	if (target.size.value > 3) {
		cost += 2;
	}

	cost = Math.round(cost - dexMod);

	if ((target.position === 'standing' || target.position === 'fleeing') 
		&& (target.cmv > cost && target.wait === 0)) {

		if (!command.roomObj) {
			roomObj = World.getRoomObject(target.area, target.roomid);
		} else {
			roomObj = command.roomObj;
		}

		exitObj = Room.getExit(roomObj, direction);

		if (exitObj) {
			if (!exitObj || !exitObj.door || exitObj.door.isOpen === true) {
				sneakAff = Character.getAffect(target, 'sneak');
				
				if (!command.targetRoom) {
					targetRoom = World.getRoomObject(exitObj.area, exitObj.id);
				} else {
					targetRoom = command.targetRoom;
				}

				if (targetRoom && (!targetRoom.size || (targetRoom.size.value >= target.size.value))) {
					canEnter = World.processEvents('beforeEnter', targetRoom, roomObj, target);
					canEnter = World.processEvents('beforeMove', roomObj, target, command);
					canEnter = World.processEvents('beforeMove', roomObj, target.items, command);

					if (canEnter) {
						if (target.followers.length) {
							for (i; i < target.followers.length; i += 1) {
								(function(index) {
									setTimeout(function() {
										cmd.move(target.followers[index], {
											arg: command.arg,
											roomObj: roomObj,
											targetRoom: targetRoom
										});
									}, 150);
								}(i));
							}							
						}

						target.cmv -= cost;
	
						if (exitObj.area !== target.area) {
							target.area = exitObj.area;
						}

						if (target.cmv < 0) {
							target.cmv = 0;
						}

						target.area = targetRoom.area;
						target.roomid = targetRoom.id;

						World.processEvents('onExit', roomObj, target, targetRoom, command);
						World.processEvents('onMove', roomObj, target, targetRoom, command);						

						if (targetRoom.terrianMod) {
							target.wait += targetRoom.terrianMod;
						}

						if (target.isPlayer) {
							this.look(target);

							Room.removePlayer(roomObj, target);

							targetRoom.playersInRoom.push(target);
						} else {
							Room.removeMob(roomObj, target);

							targetRoom.monsters.push(target);
						}

						World.msgRoom(targetRoom, {
							msg: function(receiver, fn) {
								var msg = '';

								if (!sneakAff) {
									if (Character.canSee(receiver, targetRoom)) {
										if (!target.inName) {
											if (target.long) {
												msg = '<strong>' + target.long
													+ '</strong> walks in from '
													+ parseMovementMsg(exitObj) + '.';
											} else {
												msg = '<strong>' + target.displayName
													+ '</strong> walks in from '
													+ parseMovementMsg(exitObj) + '.';
											}	
										} else if (target.inName && !target.inMessage) {
											msg = '<strong>' + target.inName
												+ '</strong> enters from '
												+ parseMovementMsg(exitObj) + '.';
										} else {
											msg = '<strong>' + target.inName
												+ '</strong> ' + target.inMessage  + ' '
												+ parseMovementMsg(exitObj) + '.';
										}
									} else if (receiver.hearing) {
										if (World.dice.roll(1, 2) === 1) {
											msg = '<strong>Something</strong> enters from '
												+ parseMovementMsg(exitObj) + '.';
										} else {
											msg = '<strong>Something</strong> comes in from '
												+ parseMovementMsg(exitObj) + '.';
										}
									}
								}

								return fn(true, msg);
							},
							playerName: target.name
						});

						World.msgRoom(roomObj, {
							msg: function(receiver, fn) {
								var msg = '';

								if (!sneakAff) {
									if (Character.canSee(receiver, roomObj)) {
										if (!target.outName) {
											if (target.long) {
												if (World.dice.roll(1, 2) === 1) {
													msg = '<span class="yellow">' + target.long
														+ ' leaves heading <strong class="grey">' 
														+ direction + '</strong>.</span>';	
												} else {
													msg = '<span class="yellow">' + target.long
														+ ' leaves traveling <strong class="grey">' 
														+ direction + '</strong>.</span>';
												}
											} else {
												msg = '<span class="yellow">' + target.displayName
													+ ' leaves going <strong class="grey">' + direction + '</strong>.</span>';
											}
										} else if (target.outName && !target.outMessage) {
											msg = '<span class="yellow">' + target.outName
											+ ' leaves traveling <strong class="grey">' + direction + '</strong>.</span>';
										} else {
											msg = '<span class="yellow">' + target.outName + target.outMessage
											+ ' <strong class="grey">' + direction + '</strong>.</span>';
										}
									} else if (receiver.hearing) {
										msg = '<span class="yellow">You can sense some movement in the area.</span>';
									}
								}

								return fn(true, msg);
							},
							playerName: target.name
						});

						World.processEvents('onMove', target, targetRoom, roomObj, command);
						World.processEvents('onEnter', targetRoom, roomObj, target, command);
						World.processEvents('onVisit', targetRoom.monsters, targetRoom, target, command);
					}
				} else {
					if (targetRoom.size) {
						World.msgPlayer(target, {
							msg: 'You are too large to move there.' ,
							styleClass: 'error'
						});
					}

					if (typeof fn === 'function') {
						return fn(false, roomObj, targetRoom);
					}
				}
			} else {
				World.msgPlayer(target, {
					msg: 'You need to open a ' + exitObj.door.name + ' first.' ,
					styleClass: 'error'
				});

				if (typeof fn === 'function') {
					return fn(false);
				}
			}
		} else {
			World.msgPlayer(target, {
				msg: 'There is no exit in that direction.',
				styleClass: 'error'
			});

			if (typeof fn === 'function') {
				return fn(false);
			}
		}
	} else {
		if (target.cmv > cost) {
			World.msgPlayer(target, {
				msg: 'You cannot do that now.', 
				styleClass: 'error'
			});
		} else {
			World.msgPlayer(target, {
				msg: 'You are too tired to move.', 
				styleClass: 'error'
			});
		}

		if (typeof fn === 'function') {
			return fn(false);
		}
	}
};

Cmd.prototype.who = function(target, command) {
	var str = '', 
	player,
	displayName = '',
	i = 0;
	
	if (World.players.length > 0) {
		for (i; i < World.players.length; i += 1) {
			player = World.players[i];

			displayName = player.displayName;

			if (player.title === '') {
				displayName += ' a level ' + player.level + ' ' + player.race + ' ' + player.charClass;
			} else {
				displayName += ' ' + player.title;
			}

			str += '<tr>' +
				'<td class="who-lvl yellow">' + player.level + '</td>' +
				'<td class="who-race green">' + player.race + '</td>' +
				'<td class="who-class red">' + player.charClass + '</td>' +
				'<td class="who-player">' + displayName + '</td>' +
			'</tr>';
		}

		str = '<div class="cmd-who"><h2>Visible Players</h2>' +
			'<table class="table table-condensed table-no-border who-list">' +
			'<thead>' +
				'<tr>' +
					'<td width="5%">Level</td>' +
					'<td width="5%">Race</td>' +
					'<td width="5%">Class</td>' +
					'<td width="85%">Name</td>' +
				'</tr>' +
			'</thead><tbody>' + str + '</tbody>' +
		'</table></div>';
		
		World.msgPlayer(target, {
			msg: str, 
			styleClass: 'cmd-who'
		});
	} else {
		World.msgPlayer(target, {
			msg: '<h2>No Visible Players</h2>',
			styleClass: 'cmd-who'
		});
	}
};

Cmd.prototype.color = function(target, command) {
	World.msgPlayer(target, {
		msg: 'Changing Color!',
		evt: 'colorChange',
		data: {value: 'red'}
	});
};

Cmd.prototype.get = function(target, command, fn) {
	var roomObj,
	i = 0,
	item,
	container,
	canGet = true,
	itemLen = 0,
	maxCarry = Character.getMaxCarry(target);

	if (target.position !== 'sleeping') {
		roomObj = World.getRoomObject(target.area, target.roomid);

		if (command.msg !== '' && Character.canSee(target, roomObj)) {
			if (command.input) {
				container = Character.getContainer(target, command);
			}

			if (!container) {
				if (command.msg !== 'all') {
					item = Room.getItem(roomObj, command);

					if (item) {
						canGet = World.processEvents('beforeGet', item, roomObj, target);
						canGet = World.processEvents('beforeGet', roomObj, target, item);

						if (canGet) {
							if (item.weight <= maxCarry) {
								Room.removeItem(roomObj, item);

								Character.addItem(target, item);

								if (item && item.weight < Character.getMaxCarry(target)) {
									World.msgRoom(roomObj, {
										msg: target.displayName + ' picks up ' + item.short,
										playerName: target.name,
										styleClass: 'yellow'
									});

									World.msgPlayer(target, {
										msg: 'You pick up ' + item.short,
										styleClass: 'blue'
									});	
								} else {

								}

								if (typeof fn === 'function') {
									return fn(target, roomObj, item);
								}
							} else {
								World.msgPlayer(target, {
									msg: 'You try to pick up ' + item.short + ' but <strong>it is too heavy</strong>.',
									styleClass: 'error'
								});
							}
							
							World.processEvents('onGet', roomObj, target, item);
							World.processEvents('onGet', item, roomObj, target);
							World.processEvents('onGet', target, roomObj, item);						
						}
					} else {
						if (!item) {
							World.msgPlayer(target, {msg: 'That item is not here.', styleClass: 'error'});
						}

						if (typeof fn === 'function') {
							return fn(target, roomObj, false);
						}
					}
				} else {
					itemLen = roomObj.items.length;
					
					if (itemLen) {	
						for (i; i < itemLen > 0; i += 1) {
							item = roomObj.items[i];
						
							if (item.weight <= maxCarry) {
								Room.removeItem(roomObj, item);
			
								Character.addItem(target, item);
							
								i -= 1;
								itemLen = roomObj.items.length;
							}
						}
					
						World.msgRoom(roomObj, {
							msg: target.displayName + ' grabs everything they can.',
							playerName: target.name,
							styleClass: 'yellow'
						});

						World.msgPlayer(target, {
							msg: 'You grab everything!',
							styleClass: 'blue'
						});

						World.processEvents('onGet', roomObj.items, roomObj, null, target);
						World.processEvents('onGet', target, roomObj, roomObj.items);

						if (typeof fn === 'function') { 
							return fn(target, roomObj, item);
						}
					} else {
						World.msgPlayer(target, {
							msg: 'You don\'t see any items here.',
							styleClass: 'error'
						});
					}
				}
			} else {
				item = Character.getFromContainer(container, command);
				
				if (item) {
					Character.removeFromContainer(container, item);
				
					Character.addItem(target, item);

					World.msgPlayer(target, {
						msg: 'You remove a <strong>' + item.displayName + '</strong> from a '
							+ container.displayName + '.', 
						styleClass: 'green'
					});

					World.processEvents('onGet', container, roomObj, item, target);
					World.processEvents('onGet', target, roomObj, item, container);
				} else {
					World.msgPlayer(target, {
						msg: 'You don\'t see that in there.',
						styleClass: 'error'
					});
				}
			}
		} else {
			World.msgPlayer(target, {
				msg: 'Get what? Specify a target or try get all.',
				styleClass: 'error'
			});

			if (typeof fn === 'function') {
				return fn(target, roomObj, item);
			}
		}
	} else {
		World.msgPlayer(target, {
			msg: 'Get something while sleeping?',
			styleClass: 'error'
		});
	}
};

Cmd.prototype.put = function(target, command) {
	var roomObj,
	i = 0,
	item,
	container,
	itemLen;

	if (target.position !== 'sleeping') {
		if (command.msg !== '') {
			container = Character.getContainer(target, command);

			if (container) {
				item = Character.getItem(target, command);

				if (item && item.refId !== container.refId && item.id !== container.id) {
					Character.removeItem(target, item);

					Character.addToContainer(container, item);

					World.msgPlayer(target, {
						msg: 'You put a <strong>' + item.displayName + '</strong> into ' + container.short + '.',
						styleClass: 'green'
					});

					World.processEvents('onPut', container, roomObj, item);
				} else {
					if (item && item.refId !== container.refId) {
						World.msgPlayer(target, {
							msg: 'You aren\'t carrying anything by that name.',
							styleClass: 'error'
						});
					} else {
						World.msgPlayer(target, {
							msg: 'You cannot put this item into itself.',
							styleClass: 'error'
						});
					}
				}
			} else {
				World.msgPlayer(target, {msg: 'Into what? You don\'t seem to have that item.', styleClass: 'error'});
			}
		} else {
			World.msgPlayer(target, {msg: 'Put what? Specify a target.', styleClass: 'error'});
		}
	} else {
		World.msgPlayer(target, {msg: 'You are currently sleeping.', styleClass: 'error'});
	}
};

Cmd.prototype.drop = function(target, command, fn) {
	var roomObj,
	i = 0,
	itemLen,
	itemArr,
	canDrop = true,
	dropCnt = 0,
	item;

	if (target.position !== 'sleeping') {
		if (command.msg !== '' && target.items.length !== 0) {
			roomObj = World.getRoomObject(target.area, target.roomid);

			if (command.msg !== 'all') {
				itemArr = Character.getItems(target, command);
				
				
				for (i; i < itemArr.length; i += 1) {
					if (itemArr[i].equipped === false) {
						item = itemArr[i];
					}
				}

				if (!item && itemArr.length) {
					item = itemArr[0];
				}

				if (item && !item.equipped) {
					canDrop = World.processEvents('beforeDrop', item, roomObj, target);
					
					if (canDrop) {
						Character.removeItem(target, item);

						Room.addItem(roomObj, item);

						World.msgRoom(roomObj, {
							msg: target.displayName + ' drops ' + item.short,
							playerName: target.name,
							styleClass: 'yellow'
						});

						World.msgPlayer(target, {
							msg: 'You drop ' + item.short,
							styleClass: 'blue'
						});

						World.processEvents('onDrop', target, roomObj, item);
						World.processEvents('onDrop', roomObj, target, item);
						World.processEvents('onDrop', item, roomObj, target);
					}
				} else {
					if (!item) {
						World.msgPlayer(target, {
							msg: 'You do not have that item.',
							styleClass: 'error'
						});
					} else {
						World.msgPlayer(target, {
							msg: 'You must remove ' + item.short + ' before you can drop it.',
							styleClass: 'error'
						});
					}
				}
			} else {
				itemLen = target.items.length;
				itemArr = target.items;

				if (itemLen) {
					for (i; i < itemLen; i += 1) {
						item = itemArr[i];
						
						if (!item.equipped) {
							dropCnt += 1;
		
							Character.removeItem(target, item);

							Room.addItem(roomObj, item);
						}
					}
					
					if (dropCnt > 1) {
						World.msgRoom(roomObj, {
							msg: target.displayName + ' drops some things.',
							playerName: target.name,
							styleClass: 'yellow'
						});
					} else if (dropCnt === 1) {
						World.msgRoom(roomObj, {
							msg: target.displayName + ' drops ' + item.short + '.',
							playerName: target.name,
							styleClass: 'yellow'
						});
					}

					World.msgPlayer(target, {
						msg: 'You drop everything that you can.',
						styleClass: 'blue'
					});
				}
			}
		} else {
			World.msgPlayer(target, {
				msg: 'You aren\'t carrying anything.',
				styleClass: 'error'
			});
		}
	} else {
		World.msgPlayer(target, {
			msg: 'You are sleeping at the moment.',
			styleClass: 'error'
		});
	}
};
Cmd.prototype.look = function(target, command) {
	var roomObj,
	displayHTML,
	monster,
	itemDescription,	
	item,
	i = 0;
	
	if (!command) {
		command = {msg: ''};
	}
	
	if (!command.roomObj) {
		roomObj = World.getRoomObject(target.area, target.roomid);
	} else {
		roomObj = command.roomObj;
	}
	
	if (target.sight) {
		if (target.position !== 'sleeping') {
			if (!command.msg) {
				if (Character.canSee(target, roomObj)) {
					displayHTML = Room.getDisplayHTML(roomObj, target);

					World.msgPlayer(target, {
						msg: displayHTML,
						styleClass: 'room'
					});
				} else {
					World.msgPlayer(target, {
						msg: 'It is too dark to see anything!',
						styleClass: 'error'
					});
				}
			} else {
				item = Character.getItem(target, command);
				
				if (item) {
					if (item.description) {
						itemDescription = item.description;
					} else {
						itemDescription = item.short;
					}

					if (item.items) {
						itemDescription += '<p>Inside you can see:</p><ul class="list container-list">'

						for (i; i < item.items.length; i += 1) {
							itemDescription += '<li>' + item.items[i].displayName  + '</li>';
						}
					}
					
					itemDescription += '</ul>';
					
					World.msgPlayer(target, {
						msg: itemDescription,
						styleClass: 'cmd-look'
					});
				} else {
					monster = Room.getMonster(roomObj, command);

					if (monster) {
						if (monster.description) {
							itemDescription = monster.description;
						} else if (monster.long) {
							itemDescription = monster.long + ' is ' + monster.position + ' ' + ' here.';
						}
						
						World.msgPlayer(target, {
							msg: itemDescription,
							styleClass: 'cmd-look'
						});
					} else {
						World.msgPlayer(target, {
							msg: 'You do not see that here.',
							styleClass: 'error'
						});
					}
				}
			}
		} else {
			World.msgPlayer(target, {
				msg: 'You cannot see anything because you are asleep.'
			});
		}
	} else {
		World.msgPlayer(target, {
			msg: 'You cannot see anything when you\'re blind.'
		});
	}
};

/** Communication Channels **/
Cmd.prototype.say = function(target, command) {
	var roomObj,
	i = 0;

	if (target.position !== 'sleeping') {
		if (command.msg !== '') {
			World.msgPlayer(target, {
				msg: '<div class="cmd-say"><span class="msg-name">You say></span> ' + command.msg + '</div>'
			});
			
			if (!command.roomObj) {
				roomObj = World.getRoomObject(target.area, target.roomid);
			} else {
				roomObj = command.roomObj
			}
			
			World.msgRoom(roomObj, {
				msg: function(receiver, fn) {
					var msg;

					if (Character.canSee(receiver, roomObj)) {
						msg = '<div class="cmd-say"><span class="msg-name">'
							+ target.displayName + ' says></span> ' + command.msg + '</div>';
					} else {
						msg = '<div class="cmd-say"><span class="msg-name">Someone says></span> ' + command.msg + '</div>';
					}

					return fn(true, msg);
				},
				playerName: target.name
			});

			World.processEvents('onSay', target, roomObj, command);
			World.processEvents('onSay', roomObj, target, command);
			World.processEvents('onSay', roomObj.monsters, roomObj, target, command);
		} else {
			World.msgPlayer(target, {
				msg: 'You have nothing to say.',
				styleClass: 'error'
			});
		}
	} else {
		World.msgPlayer(target, {
			msg: 'You can\'t say anything while sleeping!',
			styleClass: 'error'
		});
	}
};

Cmd.prototype.yell = function(target, command) {
	if (command.msg !== '') {
		World.msgPlayer(target, {
			msg: '<div class="cmd-yell"><span class="msg-name">You yell></span> ' 
				+ command.msg + '</div>'
		});
		
		World.msgArea(target.area, {
			msg: '<div class="cmd-yell"><span class="msg-name">' + target.displayName 
				+ ' yells></span> ' + command.msg + '</div>',
			playerName: target.name
		});
	} else {
		World.msgPlayer(target, {
			msg: 'You open your mouth to yell and nothing comes out. You feel like an idiot.',
			styleClass: 'error'
		});
	}
};

Cmd.prototype.chat = function(target, command) {
	if (command.msg !== '') {
		World.msgPlayer(target, {
			msg: '<span class="msg-name">You chat></span> ' + command.msg,
			styleClsss: 'cmd-chat'
		});

		World.msgWorld(target, {
			msg: '<div class="cmd-chat"><span class="msg-name">' + target.displayName + '></span> ' + command.msg + '</div>',
			playerName: target.name
		});
	} else {
		World.msgPlayer(target, {
			msg: 'To send a message to everyone on the game use <strong>chat [message]</strong>. ' 
				+ 'To learn more about communication try <strong>help communication</strong>',
			styleClass: 'error'
		});
	}
};

Cmd.prototype.tell = function(target, command) {
	var player;

	if (command.msg) {
		player = World.getPlayerByName(command.arg);

		if (player) {
			World.msgPlayer(player, {
				msg: '<strong>' + target.displayName + ' tells you></strong> ' + command.input,
				styleClass: 'red'
			});

			player.reply = target.name;

			World.msgPlayer(target, {msg: 'You tell ' + player.displayName + '> ' + command.input, styleClass: 'cmd-say red'});
		} else {
			World.msgPlayer(target, {msg: 'You do not see that person.', styleClass: 'error'});
		}
	} else {
		return World.msgPlayer(target, {msg: 'Tell who?', styleClass: 'error'});
	}
};

Cmd.prototype.reply = function(target, command) {
	var player;
	
	if (command.msg && target.reply) {
		player = World.getPlayerByName(target.reply);

		if (player) {
			World.msgPlayer(player, {
				msg: '<strong>' + target.displayName + ' replies></strong> ' + command.msg,
				styleClass: 'green'
			});

			target.reply = player.name;

			World.msgPlayer(target, {
				msg: 'You reply to ' + player.displayName + '> ' + command.msg, 
				styleClass: 'cmd-say yellow'
			});
		} else {
			World.msgPlayer(target, {msg: 'They arent there anymore.', styleClass: 'error'});
		}
	} else {
		return World.msgPlayer(target, {msg: 'Takes more than that to reply to someone.', styleClass: 'error'});
	}
};

Cmd.prototype.quit = function(target, command) {
	if (target.isPlayer) {
		if (target.position !== 'fighting' && target.wait === 0) {
			target.logged = false;
			target.verifiedName = false;
			target.verifiedPassword = false;
			target.following = "";

			Character.save(target, function() {
				World.msgPlayer(target, {
					msg: 'Add a little to a little and there will be a big pile.',
					evt: 'onDisconnect',
					styleClass: 'logout-msg',
					noPrompt: true
				});

				target.socket.leave('mud');
				target.socket.disconnect();
			});
		} else {
			if (target.position === 'fighting') {
				World.msgPlayer(target, {
					msg: 'You are fighting! Finish up before quitting.',
					styleClass: 'logout-msg'
				});
			} else {
				World.msgPlayer(target, {
					msg: 'You can\'t quit just yet!',
					styleClass: 'error'
				});
			}
		}
	}
};

Cmd.prototype.save = function(target, command) {
	if (target.isPlayer) {
		if (target.position === 'standing' && target.wait === 0) {
			Character.save(target, function() {
				World.msgPlayer(target, {
					msg: target.displayName + ' was saved. Whew!',
					styleClass: 'save green'
				});
			});
		} else if (target.position !== 'standing') {
			World.msgPlayer(target, {
				msg: 'You can\'t save while ' + target.position + '.',
				styleClass: 'save'
			});
		} else {
			World.msgPlayer(target, {
				msg: 'You can\'t save just yet!',
				styleClass: 'error'
			});
		}
	}
};

Cmd.prototype.help = function(target, command) {
	if (!command.msg) {
		command.msg = 'help';
	}

	fs.readFile('./help/' + command.msg.replace(/ /g, '_') + '.html', 'utf8', function (err, data) {
		if (!err) {
			World.msgPlayer(target, {msg: data, noPrompt: command.noPrompt, styleClass: 'cmd-help' });
		} else {
			World.msgPlayer(target, {msg: 'No help file found.', noPrompt: command.noPrompt, styleClass: 'error' });
		}
	});
};
module.exports.cmd = new Cmd();

