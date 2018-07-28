Game.resources = (function(){

    // Every time perSecond of a material is impacted, run
    // Game.resources.entries[material].ui_perSecond.update(); per material (eg metal when buying a Miner)
    // Or run Templates.uiFunctions.refreshElements('perSecond', 'all') in case of, eg, a power outage
    // Alternatively, run Templates.uiFunctions.refreshElements('persecond', 'metal') for just one material.
    // !!! Update the objects perSecond before calling the update. !!!
    function UpdatePerSecond(id) {
        var previous = -1;
        var id = id;
        this.update = function() {
            var obj = Game.resources.entries[id];
            if (obj.perSecond == previous) {return;}
            var value = Game.settings.doFormat('persecond', obj);
            Templates.uiFunctions.setClassText(value, obj.htmlId+'ps');
            previous = obj.perSecond;
            return true;
        }
    }
    var UpdateCurrent = function(id) {
        var previous = new Date();
        var id = id;
        this.update = function() {
            var obj = Game.resources.entries[id];
            if (new Date() - previous < 200) {return;}
            var value = Game.settings.doFormat('current', obj);
            Templates.uiFunctions.setClassText(value, obj.htmlId+'current');
            previous = new Date();
            // Update the storage full timer
            var node = document.getElementById('resources_res_'+id+'_SelectStorage_limit');
            if (node) {
                value = parseInt(node.value)/100;
                var seconds = Math.max(((obj.capacity*value)-obj.current), 0)/obj.perSecond;
                value = ((seconds > 0) ? Game.utils.getTimeDisplay(seconds, true) : "Done!".bold());
                document.getElementById('resources_res_'+id+'_SelectStorage_time').innerHTML = value;
            }
            return true;
        }
    }
    var UpdateCapacity = function(id) {
        var previous = new Date();
        var id = id;
        this.update = function() {
            var obj = Game.resources.entries[id];
            if (new Date() - previous < 1000) {return;}
            var value = Game.settings.doFormat('capacity', obj);
            Templates.uiFunctions.setClassText(value[0], obj.htmlId+'capacity');
            Templates.uiFunctions.setClassText(value[1], obj.htmlId+'nextStorage');


            // Storage cost
            if (id in Game.resourceCategoryData.storage) {
                var cost = Game.resourceCategoryData.storage[id].cost;
                var value = 0;
                // Find the inflation factor by comparing id's current cost with its base cost
                // This is pretty much a hack and won't work when a material doesn't need itself
                // to upgrade its storage.
                Object.keys(cost).forEach(c => {if (c == id) {value = cost[c]}});
                value = obj.capacity/value ; var newcost = {};
                // object with inflated costs
                Object.keys(cost).forEach(c => newcost[c] = cost[c]*value);
                value = Game.settings.doFormat('cost', {cost: newcost});
                Templates.uiFunctions.setClassText(value, obj.htmlId+'storageUpgrade_cost')
            }
            previous = new Date();
            return true;
        }
    }

/*
    Templates.uiFunctions.refreshElements('gain', 'all');   // can get away with only calling after rebirth
    Templates.uiFunctions.refreshElements('nextStorage', 'all');// Can get away with only calling manually after storage bought
    Templates.uiFunctions.refreshElements('stoCount', 'all');   // Can get away with only calling manually after stobld bought
    Templates.uiFunctions.refreshElements('resbldCost', 'all'); // Can get away with only calling manually after building bought
    Templates.uiFunctions.refreshElements('stoCost', 'all');     // Can get away with only calling manually after stobld bought
    Templates.uiFunctions.refreshElements('storageTime', 'all');
    Templates.uiFunctions.refreshElements('storageCost', 'all');  // Can get away with only calling manually after storage bought
*/

    var instance = {};

    instance.dataVersion = 1;
    instance.entries = {};
    instance.categoryEntries = {};
    instance.storageUpgrades = {};

    instance.storagePrice = 1;

    instance.initialise = function() {
        const resourceData = Game.resourceCategoryData;
        // TODO: Refactor this if possible, logic shouldn't be tied to internal objects
        this.entries = Object.keys(resourceData.items).reduce((result, k) => {
            result[k] = $.extend({}, resourceData.items[k], {
                ui_persecond: new UpdatePerSecond(k),
                ui_current: new UpdateCurrent(k),
                ui_capacity: new UpdateCapacity(k),
            });
            return result;
        }, {});
        this.categoryEntries = resourceData.categories;
        this.storageUpgrades.entries = resourceData.storage;
    };

    instance.update = function(delta) {
        for (var id in this.entries) {
            var data = this.entries[id];
            var addValue = data.perSecond * delta;
            this.addResource(id, addValue);
            Templates.uiFunctions.refreshElements('current', id);
        }
    };

    instance.save = function(data) {
        data.resources = { v: this.dataVersion, r: {}};
        for(var key in this.entries) {
            data.resources.r[key] = {
                n: this.entries[key].current,
                s: this.entries[key].capacity,
                u: this.entries[key].unlocked
            }
        }
    };

    instance.load = function(data) {
        if(data.resources) {
            if(data.resources.v && data.resources.v === this.dataVersion) {
                for(var id in data.resources.r) {
                    if(this.entries[id]) {
                        this.addResource(id, data.resources.r[id].n);
                        this.entries[id].unlocked = data.resources.r[id].u;
                        this.entries[id].capacity = data.resources.r[id].s;
                    }
                }
            }
        } else {
            legacyLoad(data);
        }
        //Templates.uiFunctions.refreshElements('all', 'all')
    };

	instance.getResource = function(id) {
		if (typeof this.entries[id] === 'undefined') {
			return 0;
		}
		return this.entries[id].current
	};

	instance.getStorage = function(id) {
		if (id === RESOURCE.Science) {
			// -1 for unlimited storage
			return -1;
		} else if (id === RESOURCE.RocketFuel) {
			return -1;
		} else if (typeof Game.resources.entries[id] === 'undefined') {
			return 0;
		}
		return Game.resources.entries[id].capacity;
	};

	instance.getProduction = function(id) {
        //console.log("Checking: "+id)
		if (typeof this.entries[id] === 'undefined') {
			return 0;
		}
		return this.entries[id].perSecond;
	};

	instance.addResource = function(id, count, manual) {
		if(isNaN(count) || count === null || Math.abs(count) <= 0) {
			return;
		}

		if (typeof this.entries[id] === 'undefined') {
			return;
		}

        if(manual){
            Game.statistics.add("manualResources", count);
        }

		// Add the resource and clamp
		var newValue = this.entries[id].current + count;
		var storage = this.getStorage(id);
		if (storage >= 0) {
			this.entries[id].current = Math.max(0, Math.min(newValue, storage));
		} else {
			this.entries[id].current = Math.max(0, newValue);
		}
	};

	instance.takeResource = function(id, count) {
		if(isNaN(count) || count === null || Math.abs(count) == 0) {
			return;
		}

		if (typeof this.entries[id] === 'undefined') {
			return;
		}

		// Subtract the resource and clamp
		var newValue = this.entries[id].current - Math.abs(count);
		var storage = this.getStorage(id);
		if (storage >= 0) {
			this.entries[id].current = Math.max(0, Math.min(newValue, storage));
		} else {
			this.entries[id].current = Math.max(0, newValue);
		}
	};

	instance.maxResource = function(id) {
		if (typeof this.entries[id] === 'undefined') {
			return;
		}

		// resources without a storage cap will return -1 so do nothing
		if (getStorage(id) < 0) {
			return;
		}

		this.entries[id].current = getStorage(id);
	};

    instance.upgradeStorage = function(id){
        var res = this.getResourceData(id);
        var metal = this.getResourceData("metal");
        var lunarite = this.getResourceData("lunarite");
        // Adjust what {{item}}StorageUpgrade_Cost contains after upgrading
        //  Costs 5.033B Oil, 2.013B Metal.
        if(res.current >= res.capacity*this.storagePrice){
            if(id == "metal"){
                res.current -= res.capacity*this.storagePrice;
                res.capacity *= 2;
                res.displayNeedsUpdate = true;
            } else if(id == "lunarite"){
                if(metal.current >= res.capacity*this.storagePrice*4){
                    res.current -= res.capacity*this.storagePrice;
                    metal.current -= res.capacity*this.storagePrice*4;
                    res.capacity *= 2;
                    res.displayNeedsUpdate = true;
                    metal.displayNeedsUpdate = true;
                    Templates.uiFunctions.refreshElements('storage', id);
                    Templates.uiFunctions.refreshElements('current', id);
                    Templates.uiFunctions.refreshElements('current', 'metal');
                }
            } else if(id == "meteorite"){
                if(lunarite.current >= res.capacity*this.storagePrice*4){
                    res.current -= res.capacity*this.storagePrice;
                    lunarite.current -= res.capacity*this.storagePrice*4;
                    res.capacity *= 2;
                    res.displayNeedsUpdate = true;
                    lunarite.displayNeedsUpdate = true;
                    Templates.uiFunctions.refreshElements('storage', id);
                    Templates.uiFunctions.refreshElements('current', id);
                    Templates.uiFunctions.refreshElements('current', 'lunarite');
                }
            } else if(id != "oil" && id != "gem" && id != "charcoal" && id != "wood"){
                if(lunarite.current >= res.capacity*this.storagePrice*0.4){
                    res.current -= res.capacity*this.storagePrice;
                    lunarite.current -= res.capacity*this.storagePrice*0.4;
                    res.capacity *= 2;
                    res.displayNeedsUpdate = true;
                    lunarite.displayNeedsUpdate = true;
                    Templates.uiFunctions.refreshElements('storage', id);
                    Templates.uiFunctions.refreshElements('current', id);
                    Templates.uiFunctions.refreshElements('current', 'lunarite');
                }
            } else {
                if(metal.current >= res.capacity*this.storagePrice*0.4){
                    res.current -= res.capacity*this.storagePrice;
                    metal.current -= res.capacity*this.storagePrice*0.4;
                    res.capacity *= 2;
                    res.displayNeedsUpdate = true;
                    metal.displayNeedsUpdate = true;
                    Templates.uiFunctions.refreshElements('storage', id);
                    Templates.uiFunctions.refreshElements('current', id);
                }
            }
        }
    };

    instance.refreshStorage = function(resource){
        var res = Game.resources.entries[resource]
        var cap = res.baseCapacity
        for(var id in Game.buildings.storageEntries){
            var data = Game.buildings.storageEntries[id];
            for(var storageResource in data.storage){
                if(storageResource == resource){
                    cap += data.storage[resource] * data.current;
                }
            }
        }
        res.capacity = cap;
        res.displayNeedsUpdate = true;
    };

    instance.checkStorages = function(){
    if(!Game.activeNotifications.storage || Game.activeNotifications.storage.state == "closed"){
        for(var id in this.entries){
            var data = this.entries[id];
            if(data.unlocked && data.id != "science" && data.id != "rocketFuel"){
                if(data.current < data.capacity){
                    return false;
                }
            }
        }
        Game.notifyStorage();
    }
}

    instance.calcAllBuildingProduction = function() {
        var energyBonus = 0;
        var productionBonus = 0;
    }

    instance.updateResourcesPerSecond = function(){
        var efficiencyMultiplier = 1 + (Game.tech.entries.resourceEfficiencyResearch.current * 0.01);
        var dm = 1 + 0.01*Game.stargaze.entries.darkMatter.current;
        if(!Game.stargaze.upgradeEntries.increaseProd1.achieved){
            dm = 1;
        }
        var energyDiff = 0;
        var energy = Game.resources.entries.energy;
        for(var id in Game.solCenter.entries.dyson.items){
            var data = Game.solCenter.entries.dyson.items;
            if(data.output){
                this.entries.energy.perSecond += data.output * dm;
            }
        }
        for(var resource in this.entries){
            this.entries[resource].perSecond = 0;
        }
        for(var id in Game.buildings.entries){
            var building = Game.buildings.entries[id];
            if(building.current == 0){
                // Nothing to be done
                continue;
            }
            var use = [];
            var prod = [];
            for(var value in building.resourcePerSecond){
                if(building.resourcePerSecond[value] < 0){
                    use.push(value);
                } else {
                    prod.push(value);
                }
            }
            var ok = true;
            for(var i = 0; i < use.length; i++){
                if(this.entries[use[i]].current < (-1)*building.resourcePerSecond[use[i]]){
                    ok = false;
                }
            }
            if(ok){
                for(var value in building.resourcePerSecond){
                    var val = building.resourcePerSecond[value];
                    this.entries[value].perSecond += val * building.current * efficiencyMultiplier * dm;
                }
            }
        }
        energy.perSecond -= energyDiff;
        Templates.uiFunctions.refreshElements('perSecond', 'all');
    };

    instance.unlock = function(id) {
        this.entries[id].unlocked = true;
        this.entries[id].displayNeedsUpdate = true;
        newUnlock('resources');
    };

    instance.getResourceData = function(id) {
        return this.entries[id];
    };

    instance.getCategoryData = function(id) {
        return this.categoryEntries[id];
    };

    instance.showByCategory = function(category) {
        for(var id in this.entries) {
            var data = this.entries[id];
            if(data.category === category) {
                data.hidden = false;
            }
        }
    };

    instance.hideByCategory = function(category) {
        for(var id in this.entries) {
            var data = this.entries[id];
            if(data.category === category) {
                data.hidden = true;
            }
        }
    };

    return instance;
}());