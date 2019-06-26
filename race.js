function get_index(msg) {
    var roll_match = RegExp("\\$\\[\\[(\\d+)\\]\\]");

    var index = roll_match.exec(msg);
    if( null == index ) {
        return null;
    }
    return parseInt(index[1], 10);
}

function get_attribute(id, attr_name) {
    objs = findObjs({type : 'attribute', characterid:id, name:attr_name})
    if( objs.length == 0 ) {
        return undefined;
    }
    return objs[0].get('current');
}

function set_attribute(id, attr_name, value) {
    var attrs = findObjs({type : 'attribute', characterid:id, name:attr_name});
    for (var ob of attrs) {
        ob.remove();
    }
    createObj("attribute", {name:attr_name, current:value, characterid: id});
}

function update_screen_pos(racer, pos) {
    //update the screen position of a racer to pos
    var won = false;
    var left = 166.3;
    var right = 1623.3;
    var width = 3000.0;
    var racer_token = findObjs({type:'graphic', represents:racer.id})[0];
    var screen_pos = left + ((pos / width) * (right - left));
    racer_token.set('left', screen_pos);
    var short_name = get_attribute(racer.id, 'short_name');
    //Get the pilot driving us. Could pass this in sometimes
    var pilot_attr = findObjs({type : 'attribute', name:'racer', current:short_name})[0];
    if( pilot_attr == undefined ) {
        //No-one is driving this one. Leave it alone for now
        return;
    }
    var pilot_token = findObjs({type:'graphic', represents:pilot_attr.get('characterid')})[0];
    //We need to get the Y position of the pilot's token, so grab that first
    racer_token.set('top',pilot_token.get('top'));
}

function get_taunt_penalty(pilot, racer) {
    //Ratrod can get a penalty or a bonus depending on if the players intimidated him, and whether he is in front or behind Laboni
    var taunted = parseInt(get_attribute(pilot.id, 'taunted'));
    if( 0 == taunted ) {
        return 0;
    }
    var laboni = findObjs({type : 'character', name:'Basic Junkracer'})[0];
    
    //we need both our and Leboni's position
    var our_position = parseInt(get_attribute(racer.id, 'position'));
    var laboni_position = parseInt(get_attribute(laboni.id, 'position'));
    
    log(`positions ${our_position} vs. ${laboni_position}`)
    
    if( our_position < laboni_position ) {
        return -2;
    }
    else if( our_position > laboni_position ) {
        return 1;
    }
    
    return 0;
}

on("chat:message", function(msg) {
    if(msg.type != "api") {
        return;
    }
    log(msg.content);
    log(msg.inlinerolls);
    log(msg.selected);
    if(msg.content.match('{{racer_piloting=')) {
        //get the various objects
        var pilot_match = RegExp("{{racer_name=([^}]*)}}").exec(msg.content)[1]
        var pilot = getObj("character", pilot_match);
        var racer_name = getAttrByName(pilot.id, "racer");
        var pilot_name = getAttrByName(pilot.id, "character_name");
        var racer_attr = findObjs({type : 'attribute', name:'short_name', current:racer_name})[0];
        var racer = getObj("character", racer_attr.get('characterid'))
        var racer_speed = parseInt(get_attribute(racer.id, 'speed'));
        var extra_speed = 0;

        //Check if Nyizin is piloting and they kicked into high gear
        if( msg.content.match('{{extra_speed') ) {
            var extra_speed = parseInt(RegExp("{{extra_speed=([^}]*)}}").exec(msg.content)[1]);
        }
        
        var taunt_penalty = get_taunt_penalty(pilot, racer);
        
        if( extra_speed > 0 ) {
            racer_speed += extra_speed;
            //Set the racers AC to 5 for this round
            set_attribute(racer.id, 'current_eac', 5);
            set_attribute(racer.id, 'current_kac', 5);
        }
        else {
            set_attribute(racer.id, 'current_eac', get_attribute(racer.id, 'eac'));
            set_attribute(racer.id, 'current_kac', get_attribute(racer.id, 'kac'));
        }

        //Did we succeed at the piloting check?
        var data = RegExp('{{racer_piloting=([^}]*)}}.*{{bonus=([^}]*)}}','g').exec(msg.content);
        var piloting_index = get_index(data[1]);
        var bonus_index = get_index(data[2]);
        var piloting_roll = msg.inlinerolls[piloting_index].results.rolls[0].results[0].v;
        var piloting = msg.inlinerolls[piloting_index].results.total;
        var piloting_skill = piloting - piloting_roll;
        var bonus = msg.inlinerolls[bonus_index].results.total;
        var current_penalty = parseInt(get_attribute(racer.id, 'current_penalty'));
        if( pilot_name == "Lemgem" ) {
            if( bonus > 0 ) {
                sendChat(pilot_name, "surges forward erratically");
            }
        }
        else {
            bonus = 0;
        }
        
        //The ship provides a bonus too
        var racer_bonus = parseInt(get_attribute(racer.id, 'piloting_bonus'));
        var pilot_speed_bonus = parseInt(get_attribute(pilot.id, 'speed_bonus'));

        var piloting_total = piloting + racer_bonus - current_penalty + taunt_penalty;
        log('piloting bonus from racer = ' + racer_bonus + ' base roll = ' + piloting + ' pen = ' + current_penalty + ' + taunt= ' + taunt_penalty + ' for a total of = ' + piloting_total);
        var moved = 0;
        racer_speed += bonus + pilot_speed_bonus; 
        log('racer speed = ' + racer_speed);
        
        if( piloting_total >= 16 ) {
            var message = 'they fly well and at full speed!';
            moved = racer_speed * 10;
        }
        else if( piloting_total >= 6) {
            //Update the position
            var message = 'they crash into a barrier and take time to recover!';
            
            moved = racer_speed * 5;
        }
        else {
            var message = 'they stall their engine and make no progress!'
        }
        sendChat(pilot_name, `Piloting check: [[1d1*${piloting_roll} + ${piloting_skill} + ${racer_bonus} - ${current_penalty} + ${taunt_penalty}]]: ${message}`);
        
        var pos = parseInt(get_attribute(racer.id, 'position')) + moved;
        log('New pos of ' + pos);
        
        if( pos >= 3000 ) {
            sendChat(pilot_name, "finishes the race! They go over the finish line by " + (pos - 3000) + " feet");
            pos = 3000;
        }

        set_attribute(racer.id, 'position', pos)
        update_screen_pos(racer, pos);
    }
    else if( msg.content.match('!reset')) {
        //Get each racer and set their positions to 0
        var vehicles = findObjs({type : 'attribute', name:'position'});
        var racer_names = ['bulky','spherical','sleek','well-armed'];
        var pilot_names = ['Lemgem','Velocity','Orsis','Nyizin'];
        var shuffled = [];
        
        for(var i = 0; i < 3; i++) {
            var n = msg.inlinerolls[i].results.total-1;
            shuffled.push(racer_names[n]);
            racer_names.splice(n,1);
        }
        shuffled.push(racer_names[0]);

        //we need to get pilot characters that match the names above, they're the ones whose ships can change
        for(var i = 0; i < pilot_names.length; i++) {
            var pilot = findObjs({type : 'character', name:pilot_names[i]})[0];
            log(pilot_names[i] + ' blob ' + pilot.id);
            set_attribute(pilot.id, 'racer', shuffled[i]);
        }
        
        for (var ob of vehicles) {
            var id = ob.get('characterid');
            var racer = getObj("character", id)
            set_attribute(id, 'position', 0);
            update_screen_pos(racer, 0);
            set_attribute(racer.id, 'current_penalty', 0);
            var racer_token = findObjs({type:'graphic', represents:racer.id})[0];
            racer_token.set('bar3_value',0);
            racer_token.set('bar3_max',10);
            set_attribute(racer.id, 'current_eac', get_attribute(racer.id, 'eac'));
            set_attribute(racer.id, 'current_kac', get_attribute(racer.id, 'kac'));
            set_attribute(racer.id, 'current_shields', get_attribute(racer.id, 'base_shields'));
        }
    }
    else if( msg.content.match('!shoot')) {
        var pilot_match = RegExp("{{racer_name=([^}]*)}}").exec(msg.content)[1]
        var pilot = getObj("character", pilot_match);
        var racer_name = getAttrByName(pilot.id, "racer");
        var pilot_name = getAttrByName(pilot.id, "character_name");
        var racer_attr = findObjs({type : 'attribute', name:'short_name', current:racer_name})[0];
        if( racer_attr == undefined ) {
            return;
        }
        var racer = getObj("character", racer_attr.get('characterid'))
        
        var target_name = RegExp("{{target=([^}]*)}}").exec(msg.content)[1]
        var target_pilot = findObjs({type : 'character', name:target_name})[0];
        if( undefined == target_pilot ) {
            log(`failed to find pilot with name ${target_name}`);
            return;
        }
        
        var target_racer_name = getAttrByName(target_pilot.id, "racer");
        var target_racer_attr = findObjs({type : 'attribute', name:'short_name', current:target_racer_name})[0];
        var target_racer = getObj("character", target_racer_attr.get('characterid'))
        var weapon_num = parseInt(RegExp("{{weapon_number=([^}]*)}}").exec(msg.content)[1]);
        var taunt_penalty = get_taunt_penalty(pilot, racer);
        
        for(var weapon_match = weapon_num; weapon_match >= 1; weapon_match--) {
            var weapon_type = get_attribute(racer.id, `weapon${weapon_match}_type`);
            if( undefined == weapon_type ) {
                continue;
            }
            else {
                var weapon_penalty = parseInt(get_attribute(racer.id, `weapon${weapon_match}_penalty`));
                break;
            }
        }
        if( weapon_match != weapon_num ) {
            var diff = weapon_num - weapon_match;
            //If the pilot added some weapons to his racer we can check those here. I think only Velocity does this
            var weapon_type = get_attribute(pilot.id, `weapon${diff}_type`);
            if( undefined == weapon_type ) {
               sendChat('Absalom Station1', `${pilot_name} lacks that weapon, !`);
               return;
            }
            //The pilot has it. Also check how much of a penalty it applies
            
            var weapon_penalty = parseInt(get_attribute(pilot.id, `weapon${diff}_penalty`));
        }

        if( weapon_type == 'energy') {
            var target_ac = parseInt(get_attribute(target_racer.id, 'current_eac')) + parseInt(get_attribute(target_pilot.id, 'bonus_ac'));
        }
        else if( weapon_type == 'kinetic') {
            var target_ac = parseInt(get_attribute(target_racer.id, 'current_kac')) + parseInt(get_attribute(target_pilot.id, 'bonus_ac'));
        }
        else {
            log('Error unknown weapon type ' + weapon_type);
            return;
        }

        
        sendChat('GM',`/w gm ${pilot_name} shooting with a ${weapon_type} weapon at ${target_name} who is piloting ${target_racer_name} which has the corresponding AC of ${target_ac}`);
        
        var data = RegExp('{{racer_attack=([^}]*)}}','g').exec(msg.content);
        var attack_index = get_index(data[1]);
        var attack_roll = msg.inlinerolls[attack_index].results.rolls[0].results[0].v;
        var attack_total = msg.inlinerolls[attack_index].results.total;
        var attack_skill = attack_total - attack_roll;
        var racer_attack_bonus = parseInt(get_attribute(racer.id, 'attack_bonus'));
        attack_total += racer_attack_bonus + taunt_penalty;
        
        if( attack_roll == 1 ) {
            var message = `${target_racer_name} fumbles!`;
        }
        else if( attack_total >= target_ac || attack_roll == 20 ) {
            var message = `Hit! ${target_racer_name} takes a penalty to their piloting next round`;
            //adjust the target's current_penalty value so they take it on their next piloting check
            var current_penalty = parseInt(get_attribute(target_racer.id, 'current_penalty'));
            current_penalty += weapon_penalty;
            
            //update the token's bar
            var racer_token = findObjs({type:'graphic', represents:target_racer.id})[0];
            var origin_token = findObjs({type:'graphic', represents:racer.id})[0];
            
            if( weapon_type == 'energy') {
                var effect = 'beam-frost';
            }
            else {
                var effect = 'beam-death';
            }
            spawnFxBetweenPoints({x:origin_token.get('left'), y:origin_token.get('top')}, {x:racer_token.get('left'),y:racer_token.get('top')}, effect, racer_token.get('pageid'));
            
            //Does the target have an energy protection field?
            
            var shields = get_attribute(target_racer.id, 'current_shields');
            if( shields > 0 && weapon_type == 'energy') {
                shields -= 1
                set_attribute(target_racer.id, 'current_shields', shields);
                spawnFx(racer_token.get('left'), racer_token.get('top'), 'burn-frost', racer_token.get('pageid'));
                var message = `Hit, but ${target_racer_name} has some sort of shield and actually seems to be going faster!`
                current_penalty -= 2*weapon_penalty;
            }
            else {
                spawnFx(racer_token.get('left'), racer_token.get('top'), 'explode-fire', racer_token.get('pageid'));
            }
            set_attribute(target_racer.id, 'current_penalty', current_penalty);
            
            racer_token.set('bar3_value',current_penalty);
            racer_token.set('bar3_max',10);
        }
        else {
            var message = 'Miss!';
        }
        
        sendChat(pilot_name, `shooting at ${target_name}; Attack Roll: [[1d1*${attack_roll} + ${attack_skill} + ${racer_attack_bonus} + ${taunt_penalty}]]: ${message}`);
    }
    else if( msg.content.match('!end_phase')) {
        //We just go through each vehicle and reset its piloting penalty
        var vehicles = findObjs({type : 'attribute', name:'position'});
        
        for (var ob of vehicles) {
            var id = ob.get('characterid');
            var racer = getObj("character", id);

            set_attribute(racer.id, 'current_penalty', 0);
            set_attribute(racer.id, 'current_shields', get_attribute(racer.id, 'base_shields'));
            var racer_token = findObjs({type:'graphic', represents:racer.id})[0];
            racer_token.set('bar3_value',0);
            racer_token.set('bar3_max',10);
            set_attribute(racer.id, 'current_eac', get_attribute(racer.id, 'eac'));
            set_attribute(racer.id, 'current_kac', get_attribute(racer.id, 'kac'));
        }
    }
    else if( msg.content.match('!update_pos')) {
        //Get each racer and set their positions to what's currently reflected in its attributes. This is to
        //allow the GM to manually adjust something if something doesn't go quite correctly
        var vehicles = findObjs({type : 'attribute', name:'position'});
        
        for (var ob of vehicles) {
            var id = ob.get('characterid');
            var racer = getObj("character", id)
            var pos = get_attribute(id, 'position');
            update_screen_pos(racer, pos);
        }
    }
});
