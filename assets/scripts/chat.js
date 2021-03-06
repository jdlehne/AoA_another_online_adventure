//Wrapper function to hide variables.
(function() {

  var classBaseStats = {
    Warrior: {
      strength: 6,
      intelligence: 2,
      dexterity: 4,
      constitution: 6,
      skills: ['sit', 'cleave']
    },
    Ranger: {
      strength: 4,
      intelligence: 4,
      dexterity: 6,
      constitution: 4,
      skills: ['sit', 'overdraw']
    },
    Mage: {
      strength: 2,
      intelligence: 8,
      dexterity: 4,
      constitution: 4,
      skills: ['sit', 'fireball', 'heal']
    }
  }
  var PlayerData = {
    //A static test player that will be dynamic later on.
    playerRef: {},
    playerName: '',
    playerLocation: '',
    playerChatroomRef: {},
    playerLocationRef: {},
    lastEnemyRef: null,
    lastPlayerRef: null,
    initPlayer: function() {
      PlayerData.characterExist(userInfo.uid, function(doesExsit) {
        if (!doesExsit) {
          $("#charCreation").toggle();
          ChatHandler.infoAlert("It seems you have not created a character. Please, do so now with the character create button.");
        } else {
          PlayerData.playerRef = database.ref().child('players').child(userInfo.uid);
          PlayerData.playerRef.update({
            isLoggedIn: true
          })
          PlayerData.playerRef.once('value', function(snapshot) {
            PlayerData.playerLocation = snapshot.val().location;
            PlayerData.playerChatroomRef = database.ref()
              .child('location_rooms')
              .child('location_chat')
              .child(PlayerData.playerLocation);
            PlayerData.playerName = snapshot.val().name;
            PlayerData.updateChatroom();
          });
        }
      });

    },
    getPlayerData: function(callback) {
      PlayerData.playerRef.once('value', function(snapshot) {
        if (snapshot.val()) {
          callback(snapshot.val());
        }
      })
    },
    getSurroundingLocations: function(callback) {
      database.ref()
        .child('location_rooms')
        .child('locations')
        .child(PlayerData.playerLocation)
        .once('value', function(snapshot) {
          callback(snapshot.val());
        });
    },
    changeLocation: function(newLocation) {
      PlayerData.playerRef.update({
        location: newLocation
      });
      ChatHandler.clearChat();
      PlayerData.playerRef.once('value', function(snapshot) {
        PlayerData.playerLocation = snapshot.val().location;
        PlayerData.playerChatroomRef.off('child_added');
        PlayerData.playerChatroomRef = database.ref()
          .child('location_rooms')
          .child('location_chat')
          .child(PlayerData.playerLocation);
        PlayerData.updateChatroom();
      })
    },
    updateChatroom: function() {
      PlayerData.playerChatroomRef.limitToLast(50).on('child_added', function(snapshot) {
        ChatHandler.pushMessageLocal(snapshot.val());
        SoundManager.playMessagePopOnce();
      });
      InputHandler.wipe();
      ChatHandler.shout(" has arrived!", userInfo.name);
    },
    isLoggedIn: function() {
      if ($.isEmptyObject(userInfo.displayName)) {
        return false;
      }
      return true;
    },
    characterExist: function(uid, callback) {
      var usersRef = database.ref().child("players");
      usersRef.child(userInfo.uid).once('value', function(snapshot) {
        if (snapshot.val()) {
          callback(snapshot.val().name);
        } else {
          callback(null);
        }
      });
    },
    createCharacter: function(charName, charDesc, charClass, img) {
      if (charName && charDesc && charClass) {
        if (PlayerData.isLoggedIn()) {
          var charRef = database.ref().child('players');
          charRef.update({
            [userInfo.uid]: {
              name: charName,
              isLoggedIn: true,
              description: charDesc,
              playerClass: charClass,
              exp: 0,
              level: 1,
              location: 'hammerhelm_tavern',
              image: img,
              weapon: 'rusty_stick',
              items: ['rusty_stick'],
              stats: classBaseStats[charClass],
              healthMax: (classBaseStats[charClass].constitution * 5),
              health: (classBaseStats[charClass].constitution * 5),
              manaMax: (classBaseStats[charClass].intelligence * 5),
              mana: (classBaseStats[charClass].intelligence * 5)
            }
          });
        }
      } else {
        ChatHandler.infoAlert("All fields are required.");
      }
    },
    calcDamage: function(playerData, weaponMod) {
      switch (playerData.playerClass) {
        case 'Warrior':
          return Utils.getRandomIntInclusive(0, (weaponMod * playerData.stats.strength)) + playerData.level;;
          break;
        case 'Mage':
          return Utils.getRandomIntInclusive(0, (weaponMod * playerData.stats.intelligence)) + playerData.level;
          break;
        case 'Ranger':
          return Utils.getRandomIntInclusive(0, (weaponMod * playerData.stats.dexterity)) + playerData.level;
          break;
        default:
          ChatHandler.infoAlert("You did not choose a correct class.");
          break;
      }
      return 0;
    },
    removeDead: function() {
      var monsterRoomsRef = database.ref().child('location_rooms').child('location_monsters');
      monsterRoomsRef.once('value', function(monsterRoomsSnap) {
        Object.keys(monsterRoomsSnap.val()).forEach(function(mrKey) {
          var monsterList = monsterRoomsSnap.val()[mrKey].list;
          for (var i = 1; i < monsterList.length; i++) {
            if (monsterList[i]) {
              if (monsterList[i].health <= 0) {
                monsterRoomsRef.child(mrKey).child('list').child(i).set({});
              }
            }
          }
        })
      })
    },
    lootMonster: function(exp, dropLevel, playerStats) {
      exp = exp - playerStats.level;
      if (exp <= 0) {
        exp = 1;
      }
      nextLevel = playerStats.level * 50;
      playerStats.exp += exp;
      if (playerStats.exp >= nextLevel) {
        PlayerData.levelUp(playerStats);
      } else {
        ChatHandler.infoAlert("You gained " + exp + " experince.");
      }
      weaponsRef = database.ref().child('items').child('weapons').orderByChild('level').equalTo(dropLevel);
      weaponsRef.once('value', function(snapshot) {
        var randomWeaponIndex = Utils.getRandomIntInclusive(0, Object.keys(snapshot.val()).length);
        var randomWeapon = snapshot.val()[Object.keys(snapshot.val())[randomWeaponIndex]];
        var randomWeaponName = Utils.reformatToLocationData(randomWeapon.name);
        if (playerStats.items.includes(randomWeaponName)) {
          ChatHandler.infoAlert("The weapon " + randomWeapon.name + " was dropped. However, you already had that weapon.");
        } else {
          ChatHandler.listItem(randomWeapon.name, "! New Weapon !");
          playerStats.items.push(randomWeaponName);
        }
        PlayerData.playerRef.update(playerStats);
      });
    },
    levelUp: function(playerStats) {
      playerStats.exp = 0;
      playerStats.level++;
      playerStats.stats.constitution += Utils.getRandomIntInclusive(1, 2);
      playerStats.stats.strength += Utils.getRandomIntInclusive(1, 2);
      playerStats.stats.intelligence += Utils.getRandomIntInclusive(1, 2);
      playerStats.stats.dexterity += Utils.getRandomIntInclusive(1, 2);
      playerStats.healthMax = (playerStats.stats.constitution * 5);
      playerStats.health = playerStats.healthMax;
      playerStats.manaMax = (playerStats.stats.intelligence * 5);
      playerStats.mana = playerStats.manaMax;
      ChatHandler.shout(' has reached level ' + playerStats.level + "!");
      PlayerData.playerRef.update(playerStats);
    },
    battle: function(monsterData, monsterLocationRef) {
      var playerStatsRef = database.ref().child('players').child(userInfo.uid);
      playerStatsRef.once("value", function(snapshotPlayer) {
        var playerStats = snapshotPlayer.val();
        var playerWeaponRef = database.ref().child('items').child('weapons').child(playerStats.weapon);
        playerWeaponRef.once("value", function(snapshotWeapon) {
          var weaponStats = snapshotWeapon.val();
          var playerDamage = PlayerData.calcDamage(playerStats, weaponStats.damage_mod);
          ChatHandler.listItem("You attacked " + monsterData.name + " with " + Utils.locationDataReformat(weaponStats.name) + " and did " + playerDamage + " damage!", "->");
          monsterLocationRef.update({
            health: (monsterData.health - playerDamage)
          });
          if ((monsterData.health - playerDamage) > 0) {
            monsterDamage = Utils.getRandomIntInclusive(monsterData.power, (monsterData.power * monsterData.level));
            ChatHandler.listItem(monsterData.name + ' attacks ' + playerStats.name + ' back for ' + monsterDamage + " damage!", "<-");
            if (playerStats.health - monsterDamage <= 0) {
              SoundManager.playPlayerDeathSound();
              PlayerData.createCharacter(playerStats.name, playerStats.description, playerStats.playerClass, playerStats.image);
              PlayerData.changeLocation('hammerhelm_tavern');
              ChatHandler.shout(' had died and been reborn!');
              InputHandler.wipe();
            } else {
              playerStats.health -= monsterDamage;
              PlayerData.playerRef.update(playerStats);
            }
          } else {
            PlayerData.removeDead();
            PlayerData.lootMonster(monsterData.exp, monsterData.drop_level, playerStats);
            ChatHandler.doMessage(" has defeated " + monsterData.name + "!");
            SoundManager.playDeathSound();
          }
        })

      })
    }
  }
  var ChatHandler = {
    chatMessages: [],
    populateChat: function() {
      $("#textWindow").empty();
      for (message in this.chatMessages) {
        $('#textWindow').append(this.chatMessages[message]);
      }
    },
    showScroll: function() {
      $("#textWindow").css('overflow-y', 'overlay');
    },
    hideScroll: function() {
      $("#textWindow").css('overflow-y', 'hidden');
    },
    pushMessageLocal: function(message) {
      this.chatMessages.push(message);
      this.populateChat();
      this.updateChatScroll();
    },
    pushMessagePublic: function(message) {
      var time = moment().format('LT');
      var date = moment().format('L').replace(new RegExp('[^\.]?' + moment().format('YYYY') + '.?'), '');
      var timeDisplay = date + "-" + time + " ";
      var timeShown = $("<p>");
      var timeHold = $("<span>");
      timeShown.addClass("infoAlert");
      timeHold.addClass("infoAlert");
      timeHold.text(timeDisplay);
      timeShown.prepend(timeHold);
      PlayerData.playerChatroomRef.push(timeShown.html() + message);
      this.updateChatScroll();
    },
    infoAlert: function(message) {
      var alert = $("<p>");
      alert.text(message);
      alert.addClass("infoAlert");
      this.pushMessageLocal(alert);
    },
    listItem: function(message, indi) {
      indi = indi || "~";
      var newItem = $("<p>");
      var itemIndi = $("<span>");
      itemIndi.addClass('listItemIndicator');
      newItem.addClass('listItem');
      itemIndi.text("[" + indi + "] ");
      newItem.text(message);
      newItem.prepend(itemIndi);
      newItem.prepend("&emsp;");
      this.pushMessageLocal(newItem);
    },
    playerMessage: function(message) {
      var playerName = $("<span>");
      var fullMessage = $("<p>");
      var messageText = $("<span>");
      playerName.addClass("playerName");
      messageText.addClass("playerMessage");
      playerName.text(PlayerData.playerName);
      messageText.text(message);
      fullMessage.append(' says  "');
      fullMessage.append(messageText);
      fullMessage.append('"');
      fullMessage.prepend(playerName);
      fullMessage.append("<br>");
      ChatHandler.pushMessagePublic(fullMessage.html());
    },
    doMessage: function(message, who) {
      who = who || PlayerData.playerName;
      var action = $("<p>");
      var playerMessage = $("<span>");
      var indicator = $("<span>")
      indicator.text("~");
      indicator.addClass("infoAlert");
      action.prepend(indicator);
      action.prepend("&emsp;");
      playerMessage.addClass('doAction');
      playerMessage.text(who + " " + message);
      action.append(playerMessage);
      action.append("<br>");
      ChatHandler.pushMessagePublic(action.html());
    },
    shout: function(message, who) {
      who = who || PlayerData.playerName;
      var action = $("<p>");
      var playerMessage = $("<span>");
      var indicator = $("<span>")
      indicator.text("|!| ");
      indicator.addClass("infoAlert");
      action.prepend(indicator);
      action.prepend("&emsp;");
      playerMessage.addClass('shout');
      playerMessage.text(who + " " + message);
      action.append(playerMessage);
      action.append("<br>");
      ChatHandler.pushMessagePublic(action.html());
    },
    updateChatScroll: function() {
      $("#textWindow").scrollTop($("#textWindow").prop("scrollHeight"));
    },
    clearChat: function() {
      this.chatMessages = [];
      $("#textWindow").empty();
    },
    reloadChat: function() {
      this.chatMessages = [];
      PlayerData.playerChatroomRef.once('value', function(snapshot) {
        for (message in snapshot.val()) {
          ChatHandler.chatMessages.push(snapshot.val()[message]);
        }
        ChatHandler.populateChat();
        ChatHandler.updateChatScroll();
      })
    },
    searchArea: function(area, callback) {
      database.ref().child("location_rooms")
        .child("location_items")
        .child(area)
        .once("value", function(locationItems) {
          database.ref().child('items')
            .once('value', function(items) {
              for (locItem in locationItems.val()) {
                if (locationItems.val()[locItem] in items.val()) {
                  callback(items.val()[locationItems.val()[locItem]]);
                }
              }
            });
        })
    },
    searchItem: function(area, item, callback) {
      item = item.toLowerCase();
      database.ref().child("location_rooms")
        .child("location_items")
        .child(area)
        .once("value", function(locationItems) {
          database.ref().child('items')
            .once('value', function(items) {
              if (locationItems.val().includes(item)) {
                if (items.val().hasOwnProperty(item)) {
                  callback(items.val()[item]);
                }
              } else {
                ChatHandler.infoAlert("You must be looney, there is no such thing as a " + item + " around here.");
              }
            });
        })
    }
  }
  var InputHandler = {
    commands: ['help', 'h', 'say', 's', 'map', 'm',
      'travel', 't', 'clear', 'c', 'reload', 'r',
      'do', 'd', 'inspect', 'i', 'login', 'li', 'logout', 'lo', 'giggity',
      'g', 'enemies', 'e', 'wipe', 'w', 'attack', 'atk', 'people', 'ppl',
      'me', 'skills', 'inventory', 'inv', 'equip', 'eqp', 'drop'
    ],
    commandHistory: [],
    historyIndex: 0,
    parseText: function(input) {

      var currentCommand = '';
      var message = '';
      if (input.charAt(0) === '/') {
        InputHandler.commandHistory.push(input);
        InputHandler.historyIndex = InputHandler.commandHistory.length;
        input = input.slice(1);
        if (input.includes(' ')) {
          currentCommand = input.substr(0, input.indexOf(' '));
          message = input.substr(input.indexOf(' ') + 1);
        } else {
          currentCommand = input;
        }
        if (this.commands.includes(currentCommand)) {
          if (!PlayerData.isLoggedIn()) {
            if (currentCommand === 'login' || currentCommand === 'li') {
              Login.loginUser(function() {
                PlayerData.initPlayer();
              });
            } else {
              ChatHandler.infoAlert("You are not logged in. Use /login (make sure popups are enabled)");
            }
          } else {
            this[currentCommand](message);
          }
        } else if (Skills.skills.includes(currentCommand)) {
          Skills.parseSkill(currentCommand, message);
        } else {
          ChatHandler.infoAlert("You did not enter a correct command/skill.");
        }
      } else {
        if (PlayerData.isLoggedIn()) {
          PlayerData.characterExist(userInfo.uid, function(doesExsit) {
            if (doesExsit) {
              InputHandler.say(input);
            } else {
              ChatHandler.infoAlert("It seems you have not created a character. Please, do so now with the character create button.");
            }
          });
        } else {
          ChatHandler.infoAlert("You are not logged in. Use /login (make sure popups are enabled)");
        }
      }
    },
    //Commands
    say: function(text) {
      if (text !== '') {
        ChatHandler.playerMessage(text);
      }
    },
    help: function(text) {
      ChatHandler.listItem('', '------------------------------------------');
      ChatHandler.infoAlert("All commands/skills begin with a '/'");
      ChatHandler.listItem('', '------------------------------------------');
      ChatHandler.infoAlert("To display this command again type '/help'");
      ChatHandler.listItem('', '------------------------------------------');
      ChatHandler.infoAlert("'/li' to login and create a character.")
      ChatHandler.listItem('', '------------------------------------------');
      ChatHandler.infoAlert("Use the buttons located below the chat to display command information and character information.");
      ChatHandler.listItem('', '------------------------------------------');
      ChatHandler.infoAlert("Fight monsters, level up, and work together!");


    },
    inventory: function(text) {
      PlayerData.getPlayerData(function(data) {
        ChatHandler.infoAlert("<Inventory>");
        data.items.forEach(function(item) {
          ChatHandler.listItem(Utils.locationDataReformat(item));
        })
      });
    },
    drop: function(text) {
      var weaponUnformated = Utils.locationDataReformat(text);
      var weaponFormated = Utils.reformatToLocationData(text);
      if (text) {
        PlayerData.getPlayerData(function(data) {
          if (data.items.includes(weaponFormated)) {
            if (data.weapon === weaponFormated) {
              ChatHandler.infoAlert("You cannot drop the weapon you are using!");
            } else {
              data.items.splice(data.items.indexOf(weaponFormated), 1);
              PlayerData.playerRef.update(data);
              ChatHandler.infoAlert("You droped " + weaponUnformated + ". It's gone forever!");
            }
          } else {
            ChatHandler.infoAlert("You dont appear to have " + weaponUnformated + " in your inventory.");
          }
        });
      } else {
        ChatHandler.infoAlert("You need to specify a weapon to drop.");
      }
    },
    equip: function(text) {
      var weaponUnformated = Utils.locationDataReformat(text);
      var weaponFormated = Utils.reformatToLocationData(text);
      if (text) {
        PlayerData.getPlayerData(function(data) {
          if (data.items.includes(weaponFormated)) {
            data.weapon = weaponFormated;
            PlayerData.playerRef.update(data);
            ChatHandler.infoAlert("You equip " + weaponUnformated);
          } else {
            ChatHandler.infoAlert("You dont appear to have " + weaponUnformated + " in your inventory.");
          }
        });
      } else {
        ChatHandler.infoAlert("You need to specify a weapon to equip.");
      }
    },
    map: function(text) {
      ChatHandler.infoAlert("Locations surrounding " + Utils.locationDataReformat(PlayerData.playerLocation) + ": ");
      var messageP = $("<p>")

      PlayerData.getSurroundingLocations(function(data) {
        for (loc in data) {
          ChatHandler.listItem(Utils.locationDataReformat(loc));
        }
      });
    },
    travel: function(text) {
      var location = Utils.reformatToLocationData(text);
      PlayerData.getSurroundingLocations(function(surrounding) {
        if (surrounding.hasOwnProperty(location)) {
          ChatHandler.shout(" has traveled to " + Utils.locationDataReformat(location), userInfo.name);
          PlayerData.changeLocation(location);
        } else {
          ChatHandler.infoAlert("You did not enter a correct location.");
          InputHandler.map();
        }
      });
    },
    clear: function(text) {
      ChatHandler.clearChat();
    },
    reload: function(text) {
      ChatHandler.reloadChat();
    },
    do: function(text) {
      ChatHandler.doMessage(text);
    },
    login: function(text) {
      ChatHandler.infoAlert("You are already logged in.");
    },
    logout: function(text) {
      Login.logoutUser(function() {
        ChatHandler.shout(" has logged out!", userInfo.name);
        PlayerData.playerRef.update({
          isLoggedIn: false
        });
        ChatHandler.clearChat();
        ChatHandler.infoAlert("You are now logged out!");
        userInfo.clear();
      });
    },
    inspect: function(text) {
      text = Utils.reformatToLocationData(text);
      if (text === "") {
        ChatHandler.infoAlert("You look around and see the following;");
        ChatHandler.searchArea(PlayerData.playerLocation, function(data) {
          ChatHandler.listItem(data.name);
        });
      } else {
        ChatHandler.searchItem(PlayerData.playerLocation, text, function(data) {
          $("#inspectName").text(data.name);
          $("#inspectDesc").text(data.description);
        });
      }
    },
    giggity: function(text) {
      ChatHandler.infoAlert("Giggity, Giggity!")
    },
    enemies: function(text) {
      database.ref().child('location_rooms')
        .child('location_monsters')
        .child(PlayerData.playerLocation)
        .child('list')
        .once('value', function(snapshot) {
          if (snapshot.val()) {
            ChatHandler.infoAlert("You look for hostile beings and find...");
            Utils.asyncLoop(snapshot.val().length, function(loop) {
              var monster = loop.iteration();
              if (snapshot.val()[monster]) {
                if (snapshot.val()[monster].name == 'unnamed') {
                  AjaxCalls.getRandomName(function(newName) {
                    database.ref().child('location_rooms')
                      .child('location_monsters')
                      .child(PlayerData.playerLocation)
                      .child('list')
                      .child(monster).update({
                        name: newName
                      });
                    ChatHandler.listItem((snapshot.val()[monster].type + ' - ' + newName), monster);
                  });
                } else {
                  if (text) {
                    if (PlayerData.lastEnemyRef) {
                      PlayerData.lastEnemyRef.off('value');
                    }
                    PlayerData.lastEnemyRef = database.ref().child('location_rooms')
                      .child('location_monsters')
                      .child(PlayerData.playerLocation)
                      .child('list')
                      .child(text);
                    PlayerData.lastEnemyRef.on('value', function(snapshot) {
                      if (snapshot.val()) {
                        $("#enemyNameDisplay").text("Name: " + snapshot.val().name);
                        $("#enemyType").text("Type: " + snapshot.val().type);
                        $("#enemyDescription").text(snapshot.val().description);
                        $("#enemyHealth").text("Health: " + snapshot.val().health);
                        $("#enemyImage").attr('src', snapshot.val().image);
                      }
                    })
                    return;
                  } else {
                    ChatHandler.listItem((snapshot.val()[monster].type + ' - ' + snapshot.val()[monster].name), monster);
                  }
                }
              }
              loop.next();
            });
          } else {
            ChatHandler.infoAlert("There doesn't appear to be any enemies!");
          }
        });
    },
    wipe: function(text) {
      this.clear();
      this.reload();
    },
    attack: function(text) {
      database.ref().child('location_rooms')
        .child('location_monsters')
        .child(PlayerData.playerLocation)
        .child('list')
        .once('value', function(snapshot) {
          var monsterList = snapshot.val();
          if (monsterList[text]) {
            if (monsterList[text].name === 'unnamed') {
              AjaxCalls.getRandomName(function(newName) {
                database.ref().child('location_rooms')
                  .child('location_monsters')
                  .child(PlayerData.playerLocation)
                  .child('list')
                  .child(text).update({
                    name: newName
                  });
                monsterList[text].name = newName
                PlayerData.battle(monsterList[text], database.ref().child('location_rooms')
                  .child('location_monsters')
                  .child(PlayerData.playerLocation)
                  .child('list')
                  .child(text));
              })
            } else {
              PlayerData.battle(monsterList[text], database.ref().child('location_rooms')
                .child('location_monsters')
                .child(PlayerData.playerLocation)
                .child('list')
                .child(text));
            }
          } else {
            ChatHandler.infoAlert('You wave your hands about wildly in the air, since your target doesnt seem to exsist.');
          }
        });
    },
    people: function(text) {
      if (text) {
        if (PlayerData.lastPlayerRef) {
          database.ref().child('players').off('value');
        }
        PlayerData.lastPlayerRef = database.ref().child('players').orderByChild('name').equalTo(text).on('value', function(snapshot) {
          if (snapshot.val()) {
            var player = snapshot.val()[Object.keys(snapshot.val())[0]];
            var healthPerc = ((player.health / player.healthMax) * 100);
            var manaPerc = ((player.mana / player.manaMax) * 100);
            $("#playerImage").attr('src', player.image);
            $("#playerNameDisplay").text("Name: " + player.name);
            $("#playerClass").text("Class: " + player.playerClass);
            $("#playerDescriptionInspect").text(player.description);
            $("#playerHealth").text("Health " + player.health);
            $("#playerExp").text("Experience: " + player.exp);
            $("#playerHealth").text(player.health + "/" + player.healthMax);
            $('#playerHealth').attr('aria-valuenow', healthPerc).css('width', healthPerc + "%");
            $("#playerMana").text(player.mana + "/" + player.manaMax);
            $('#playerMana').attr('aria-valuenow', manaPerc).css('width', manaPerc + "%");
            $("#playerExp").text("Experince: " + player.exp);
            $("#playerLvl").text("Level: " + player.level + " | Exp to next: " + ((player.level * 50) - player.exp));
            database.ref().child('items').child('weapons').child(player.weapon).once('value', function(snapshot) {
              $("#playerWeapon").text("Weapon: " + snapshot.val().name);
              $("#playerDesc").text(snapshot.val().description);
              $("#playerPower").text("Weapon Power: " + snapshot.val().damage_mod);
            })
          } else {
            ChatHandler.infoAlert(text + " doesn't seem to be a person in the area. Are you feeling okay?");
          }
        });
      } else {
        ChatHandler.infoAlert("<People>");
        database.ref().child('players').orderByChild('location').equalTo(PlayerData.playerLocation).once('value', function(snapshot) {
          if (snapshot.val()) {
            Object.keys(snapshot.val()).forEach(function(person) {
              if (snapshot.val()[person].isLoggedIn) {
                ChatHandler.listItem(snapshot.val()[person].name);
              }
            })
          }
        });
      }
    },
    skills: function(text) {
      PlayerData.getPlayerData(function(playerInfo) {
        ChatHandler.infoAlert("<Skills>");
        playerInfo.stats.skills.forEach(function(skill) {
          Skills.hasSkill(skill, function(skillinfo) {
            var effectsList = '- ';
            var manaCost = skillinfo.mana + Math.floor(playerInfo.level * 1.5);
            Object.keys(skillinfo.effects).forEach(function(effect) {
              effectsList = effectsList + effect + " - ";
            })
            ChatHandler.listItem(skillinfo.description + " Effects: " + effectsList, skillinfo.name + "  - Mana: " + manaCost);
          });
        })
      });
    },
    //Shortcut commands.
    me: function(text) {
      this.ppl(PlayerData.playerName);
    },
    inv: function(text) {
      this.inventory(text);
    },
    eqp: function(text) {
      this.equip(text);
    },
    ppl: function(text) {
      this.people(text);
    },
    atk: function(text) {
      this.attack(text);
    },
    w: function(text) {
      this.wipe(text);
    },
    e: function(text) {
      this.enemies(text);
    },
    t: function(text) {
      this.travel(text);
    },
    m: function(text) {
      this.map(text);
    },
    s: function(text) {
      this.say(text);
    },
    h: function(text) {
      this.help(text);
    },
    c: function(text) {
      this.clear(text);
    },
    r: function(text) {
      this.reload(text);
    },
    d: function(text) {
      this.do(text);
    },
    i: function(text) {
      this.inspect(text);
    },
    li: function(text) {
      this.login(text);
    },
    lo: function(text) {
      this.logout(text);
    },
    g: function(text) {
      this.giggity(text);
    },
  };

  var Skills = {
    skills: [],
    effects: ['heal', 'regen', 'damage'],
    init: function() {
      database.ref().child('skills').once('value', function(snapshot) {
        Object.keys(snapshot.val()).forEach(function(skill) {
          Skills.skills.push(skill);
        })
      });
    },
    hasSkill: function(skill, callback) {
      PlayerData.playerRef.child('stats').child('skills').once('value', function(snapshot) {
        if (snapshot.val().includes(skill)) {
          database.ref().child('skills').child(skill).once('value', function(skillSnap) {
            callback(skillSnap.val());
          })
        }
      })
    },
    parseSkill: function(skill, target) {
      Skills.hasSkill(skill, function(skillInfo) {
        if ((skillInfo.target_player && target.length > 1) ||
          (skillInfo.target_enemy && parseInt(target)) ||
          (!skillInfo.target_enemy && !skillInfo.target_player && !target)) {
          PlayerData.getPlayerData(function(playerInfo) {
            var manaCost = skillInfo.mana + Math.floor(playerInfo.level * 1.5);
            if (skillInfo.mana <= 0) {
              manaCost = 0;
            }
            if ((playerInfo.mana - manaCost) >= 0) {
              playerInfo.mana -= manaCost;
              PlayerData.playerRef.update(playerInfo);
              ChatHandler.listItem(" was used.", skillInfo.name);
              Object.keys(skillInfo.effects).forEach(function(effect) {
                if (Skills.effects.includes(effect)) {
                  Skills[effect](skillInfo.effects[effect], playerInfo, target);
                }
              })
            } else {
              ChatHandler.infoAlert("You do not have enough mana to use that skill!");
            }
          })
        } else {
          ChatHandler.infoAlert("You choose an invalid target.");
        }
        //Skills[skill](target, skillInfo);
      });
    },
    heal: function(power, playerInfo, target) {
      power = power + playerInfo.stats.intelligence;
      if (typeof target === 'number') {
        ChatHandler.infoAlert("You cannot heal enemies");
      } else if (target.length > 1) {
        database.ref().child('players').orderByChild('name').equalTo(target).once('value', function(snapshot) {
          if (snapshot.val()) {
            var targetKey = Object.keys(snapshot.val())[0];
            var targetInfo = snapshot.val()[targetKey];
            var newHealth = targetInfo.health += power;
            if (newHealth <= targetInfo.healthMax) {
              targetInfo.health = newHealth;
            } else {
              targetInfo.health = targetInfo.healthMax;
            }
            PlayerData.playerRef.update(playerInfo);
            database.ref().child('players').child(targetKey).update({
              health: targetInfo.health
            });
            ChatHandler.infoAlert("You healed " + targetInfo.name + " for " + power + " health.");
          } else {
            ChatHandler.infoAlert(target + " doesn't seem to exsit.");
          }
        })
      } else {
        var newHealth = playerInfo.health += power;
        if (newHealth <= playerInfo.healthMax) {
          playerInfo.health = newHealth;
        } else {
          playerInfo.health = playerInfo.healthMax;
        }
        PlayerData.playerRef.update(playerInfo);
        ChatHandler.infoAlert("You healed " + power + " health.");
      }

    },
    regen: function(power, playerInfo, target) {
      power = power + playerInfo.stats.intelligence;
      if (typeof target === 'number') {
        ChatHandler.infoAlert("You cannot heal enemies");
      } else if (target.length > 1) {
        database.ref().child('players').orderByChild('name').equalTo(target).once('value', function(snapshot) {
          if (snapshot.val()) {
            var targetKey = Object.keys(snapshot.val())[0];
            var targetInfo = snapshot.val()[targetKey];
            var newMana = targetInfo.mana += power;
            if (newMana <= targetInfo.healthMana) {
              targetInfo.mana = newMana;
            } else {
              targetInfo.mana = targetInfo.healthMana;
            }
            snapshot.ref.update({
              mana: targetInfo.mana
            });
            PlayerData.playerRef.update(playerInfo);
            ChatHandler.infoAlert("You regened " + targetInfo.name + " for " + power + " mana.");
          } else {
            ChatHandler.infoAlert(target + " doesn't seem to exsit.");
          }
        });
      } else {
        var newMana = playerInfo.mana += power;
        if (newMana <= playerInfo.manaMax) {
          playerInfo.mana = newMana;
        } else {
          playerInfo.mana = playerInfo.manaMax;
        }
        PlayerData.playerRef.update(playerInfo);
        ChatHandler.infoAlert("You regened " + power + " mana.");
      }

    },
    damage: function(power, playerInfo, target) {
      switch (playerInfo.playerClass) {
        case 'Warrior':
          power = playerInfo.stats.strength + power;
          break;
        case 'Mage':
          power = playerInfo.stats.intelligence + power;
          break;
        case 'Ranger':
          power = playerInfo.stats.dexterity + power;
          break;
        default:
          break;

      }
      if (typeof parseInt(target) === 'number') {
        database.ref().child('location_rooms')
          .child('location_monsters')
          .child(PlayerData.playerLocation)
          .child('list').child(target).once('value', function(snapshot) {
            if (snapshot.val()) {
              var targetKey = Object.keys(snapshot.val())[0];
              var monsterData = snapshot.val();
              var playerStats = playerInfo;
              var playerDamage = power;
              snapshot.ref.update({
                health: (monsterData.health - playerDamage)
              });
              ChatHandler.listItem("You attacked  " + monsterData.name + " and did " + playerDamage + " damage!", "->");
              if ((monsterData.health - playerDamage) > 0) {
                monsterDamage = Utils.getRandomIntInclusive(monsterData.power, (monsterData.power * monsterData.level));
                ChatHandler.listItem(monsterData.name + ' attacks ' + playerStats.name + ' back for ' + monsterDamage + " damage!", "<-");
                if (playerStats.health - monsterDamage <= 0) {
                  SoundManager.playPlayerDeathSound();
                  PlayerData.createCharacter(playerStats.name, playerStats.description, playerStats.playerClass, playerStats.image);
                  PlayerData.changeLocation('hammerhelm_tavern');
                  ChatHandler.shout(' had died and been reborn!');
                  InputHandler.wipe();
                } else {
                  playerStats.health -= monsterDamage;
                  PlayerData.playerRef.update(playerStats);
                }
              } else {
                PlayerData.removeDead();
                PlayerData.lootMonster(monsterData.exp, monsterData.drop_level, playerStats);
                ChatHandler.doMessage(" has defeated " + monsterData.name + "!");
                SoundManager.playDeathSound();
              }
            } else {
              ChatHandler.infoAlert(" That monster doesn't seem to exsist.");
            }
          })
      } else {
        ChatHandler.infoAlert("You can only damage enemies you meanie....");
      }
    }
  }
  var imageManager = {
    playerImages: [
      'TCP Armored 1.jpg',
      'TCP Armored 2.jpg',
      'TCP Armored 3.jpg',
      'TCP Cyberpunk 4.jpg',
      'TCP Cyberpunk 5.jpg',
      'TCP Cyberpunk 7.jpg',
      'TCP Dwarf 4.jpg',
      'TCP Dwarf 5.jpg',
      'TCP Dwarf 6.jpg',
      'TCP Elf 3.jpg',
      'TCP Elf 4.jpg',
      'TCP Elf 5.jpg',
      'TCP Elf 6.jpg',
      'TCP Elf 7.jpg',
      'TCP Elf 8.jpg',
      'TCP Elf 9.jpg',
      'TCP Gnome 2.jpg',
      'TCP Hero 1.jpg',
      'TCP Hero 2.jpg',
      'TCP Hero 3.jpg',
      'TCP Human 4.jpg',
      'TCP Human 5.jpg',
      'TCP Pirate 3.jpg',
      'TCP Pirate 4.jpg',
      'TCP Pirate 7.jpg',
      'TCP Robot 4.jpg'
    ],
    loadImages: function(callback) {
      $("#characterImages").empty();
      this.playerImages.forEach(function(image, index) {
        characterImagesRef.child(image).getDownloadURL().then(function(url) {
          var newImage = $("<img>");
          newImage.addClass('img-thumbnail col-2');
          newImage.attr('width', '50px')
          newImage.attr('src', url);
          newImage.attr('id', "selectedImage" + index)
          $("#characterImages").append(newImage);
          $("#selectedImage" + index).on('click', function() {
            callback($(this).attr('src'));

          })
        });
      })
    }
  }
  //jQuery on-ready.
  $(function() {
    var characterClass = '';
    var characterImage = '';
    Login.pageLoad(PlayerData.initPlayer);
    Skills.init();
    InputHandler.help();
    SoundManager.playBackgroundMusicLoop();
    $("#imageSelect").toggle();
    $("#charCreation").toggle();
    $("#music").on('click', function() {
      SoundManager.playBackgroundMusicLoop();
    });
    $("#classSelector li a").on("click", function() {
      characterClass = $(this).text();
      $("#dropdownMenuButton").text(characterClass);
    });
    $('#chatForm').on('submit', function(event) {
      event.preventDefault();
      InputHandler.parseText($('#commandInput').val().trim());
      $('#commandInput').val('');
    })
    $("#textWindow").on("mouseenter", function() {
      ChatHandler.showScroll();
    }).on("mouseleave", function() {
      ChatHandler.hideScroll();
    });
    $("#charLoadBtn").on("click", function() {
      var name = $("#playerName").val();
      var desc = $("#playerDescription").val();
      if (name.length > 15) {
        ChatHandler.infoAlert('Name must be less that 15 characters.');
        return;
      };
      if (desc.length > 150) {
        ChatHandler.infoAlert('Description must be less that 150 characters.')
        return;
      };
      if (!characterClass) {
        ChatHandler.infoAlert('You must choose a class');
        return;
      }
      database.ref().child('players').orderByChild('name').equalTo(name).once('value', function(snapshot) {
        if (snapshot.val()) {
          ChatHandler.infoAlert("That name is already taken!");
        } else {
          if (PlayerData.isLoggedIn()) {
            $("#charCreation").toggle();
            $("#imageSelect").toggle();
            $("#chatArea").toggle();
            imageManager.loadImages(function(source) {
              characterImage = source;
              $("#imageSelect").toggle();
              $("#chatArea").toggle();
              PlayerData.createCharacter(name, desc, characterClass, characterImage);
              PlayerData.initPlayer();
            });
          }
        }
      })

    });
    $("#chatForm").on('keyup', function(event) {
      var keycode = event.keyCode;
      if (keycode === 40) {
        $("#commandInput").val(InputHandler.commandHistory[InputHandler.historyIndex]);
        if (InputHandler.historyIndex < InputHandler.commandHistory.length) {
          InputHandler.historyIndex++;
        }
      }
      if (keycode === 38) {
        $("#commandInput").val(InputHandler.commandHistory[InputHandler.historyIndex]);
        if (InputHandler.historyIndex > 0) {
          InputHandler.historyIndex--;
        }
      }
    });
    $(window).on('unload', function() {
      InputHandler.logout();
    });
  });
}())
