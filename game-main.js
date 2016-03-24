"use strict";

var Game = function (options) {

    document.oncontextmenu = function () { return false; } // disable context menu

    var self = this;

    var canvas = document.getElementById(options.canvasId);
    this.Stage = new createjs.Stage(canvas);
    

    this.ObjectiveDisplay = document.getElementById(options.objectiveDisplayId)
    this.TimePanel = document.getElementById(options.timePanelId)

    this.StageDimensions = [canvas.width, canvas.height];

    canvas = null;

    this.LevelContainer = new createjs.Container();
    this.Stage.addChild(this.LevelContainer);

    this.MessContainer = new createjs.Container();
    this.LevelContainer.addChild(this.MessContainer);

    this.EndGameCallback = options.onEndGame;

    this.MapDimensions = [0, 0];

    this.LevelBase = undefined;

    this.ViewOffset = [0, 0];

    this.LevelDefinition = JSON.parse(JSON.stringify(options.levelDefinition));

    this.GameProps = [];
    this.PeopleToRender = [];
    this.NPCs = [];

    this.ObjectiveData = {
        ToRescue: 0,
        RescueKIA: 0,
        Rescued: 0,
        Enemies: 0,
        EnemiesKIA: 0,
        AssassinationTargets: 0,
        AssassinationTargetsKIA: 0,
        PlayerOperatives: 0,
        PlayerOperativesKIA: 0,
        Success: true,
        TotalSeconds: 0
    };

    this.Player = undefined;

    this.Extraction = undefined;
    this.ExtractionPointRange = 100;
    this.ExtractionActive = false;

    this.music = null;
    this.musicfile = options.Music;
    this.mission_outcome_sound_played = false;

    this.Init(options);

    this.Stage.onMouseDown = function (event) {

        var coords = self.Stage.localToLocal(self.Stage.mouseX, self.Stage.mouseY, self.LevelContainer);

        switch (event.nativeEvent.button) {
            case 0: // left click
                self.Player.SetDestination([coords.x, coords.y]);
                break;
            case 2: // right click
                // shoot
                self.Player.Shoot([coords.x, coords.y]);
                break;
        }

        event = null;
    };
};
Game.prototype = {
    Init: function (options) {
        var self = this;

        var loading_text = new createjs.Text('Establishing Satellite Uplink', 'bold 36px Iceland', '#000');
        loading_text.x = 100;
        loading_text.y = 100;
        this.LevelContainer.addChild(loading_text);

        var progress_text = new createjs.Text('0%', 'bold 18px Iceland', '#000');
        progress_text.x = 530;
        progress_text.y = 150;
        this.LevelContainer.addChild(progress_text);

        var progress_bar = new createjs.Shape(
			new createjs.Graphics()
				.setStrokeStyle(1)
				.beginStroke(createjs.Graphics.getRGB(0, 0, 0))
				.beginFill(createjs.Graphics.getRGB(0, 255, 0))
				.drawRect(0, 0, 425, 20)
		);
        progress_bar.scaleX = 0;
        progress_bar.x = 100;
        progress_bar.y = 150;
        this.LevelContainer.addChild(progress_bar);



        this.Stage.update();

        var manifest = [
			{ src: options.baseImage, id: 'base' },
			{ src: '139979__dcsimon__44-magnum.mp3|139979__dcsimon__44-magnum.ogg', id: 'gunshot', data: 32 },
			{ src: '38704__argitoth__archi-sonar-05.mp3|38704__argitoth__archi-sonar-05.ogg', id: 'scan', data: 4 },
			{ src: 'mission_completed.mp3|mission_completed.ogg', id: 'mission_completed', data: 1 },
			{ src: 'mission_failed.mp3|mission_failed.ogg', id: 'mission_failed', data: 1 },
			{ src: 'synd_music_ingame_agent_final_mq_low.mp3|synd_music_ingame_agent_final_mq_low.ogg', id: 'music2', data: 1 },
			{ src: 'synd_music_ingame_standard_final_mq_low.mp3|synd_music_ingame_standard_final_mq_low.ogg', id: 'music1', data: 1 },
			{ src: 'person-operative.png', id: 'person-operative' },
			{ src: 'person-general.png', id: 'person-general' },
			{ src: 'person-police.png', id: 'person-police' }
		];

        var loader = new createjs.PreloadJS();
        loader.useXHR = true;  // XHR loading is not reliable when running locally.

        loader.onComplete = this._OnLoaderComplete(loader, self, loading_text, progress_bar, progress_text, options);
        loader.onProgress = this._OnLoaderProgress(loader, self, progress_bar, progress_text);

        loader.installPlugin(createjs.SoundJS);
        loader.loadManifest(manifest);
        manifest = null;
    },
    _OnLoaderComplete: function (loader, self, loading_text, progress_bar, progress_text, options) {
        return function () {
            self.LevelContainer.scaleX = 1.5;
            self.LevelContainer.scaleY = 1.5;

            self.LevelBase = new createjs.Bitmap(loader.getResult("base").result);
            self.LevelContainer.addChildAt(self.LevelBase, 0);

            self.MapDimensions = [self.LevelBase.image.width * self.LevelContainer.scaleX, self.LevelBase.image.height * self.LevelContainer.scaleY];

            self.ScrollManager = new ScrollManager(self.LevelContainer, self.Stage, self.StageDimensions, self.MapDimensions, 1.5);

            self.LevelContainer.removeChild(loading_text);
            self.LevelContainer.removeChild(progress_text);
            self.LevelContainer.removeChild(progress_bar);

            loading_text = null;
            progress_text = null;
            progress_bar = null;

            self.InitialiseLevel(options);

            self.StartLevel();

            options = null;
            loader = null;
            self = null;
        };
    },
    _OnLoaderProgress: function (loader, self, progress_bar, progress_text) {
        return function () {
            progress_bar.scaleX = loader.progress;
            progress_text.text = Math.round(loader.progress * 100, 2) + '%';
            self.Stage.update();
        };
    },
    InitialiseLevel: function (options) {

        var self = this;

        this.Player = new Player();

        var c = new Clipper(this.LevelBase.image);

        // loop through the 3D regions
        for (var i = 0; i < this.LevelDefinition[CONST.AreaType.ThreeD].length; i++) {
            var region = this.LevelDefinition[CONST.AreaType.ThreeD][i];
            var region_id = region[0];
            var region_data = region[1];

            // each region, grab the image and slot it into it's own image tag
            var result = c.Clip(region_data, 'region' + region_id);

            var prop = new GameProp(new createjs.Bitmap(result.canvas), result.top, result.right, result.bottom, result.left, region_data);
            prop.Bitmap.x = result.left;
            prop.Bitmap.y = result.top;
            this.GameProps.push(prop);

            result.canvas.parentNode.removeChild(result.canvas);
            result = undefined;
        }

        c.Dispose();
        c = null;

        this.LevelDefinition[CONST.AreaType.Blocked].push([-1, [[0, 0], [this.LevelBase.image.width, 0], [this.LevelBase.image.width, this.LevelBase.image.height], [0, this.LevelBase.image.height], [0, 0]]]);

        this.MiniMap = new MiniMapCanvas(this.LevelDefinition[CONST.AreaType.Blocked], this.Player, [this.LevelBase.image.width, this.LevelBase.image.height], this.StageDimensions, options.miniMapDimensions, options.miniMapId, self.LevelContainer.scaleX);
        this.TeamPanel = new TeamManagementPanel(this.Player, options.teamPanelId);
        this.ScrollManager.OnScrollCallBack = function (x, y) {
            self.MiniMap.UpdateOffset(x, y);
        };

        // SETUP OPERATIVE

        var animations = {};

        animations["OP-DEAD"] = 3;
        animations["OP-DYING"] = [0, 3, "OP-DEAD", 25];
        animations["OP-SHOT-S"] = [4, 4, , 15];
        animations["OP-SHOT-E"] = [5, 5, , 15];
        animations["OP-SHOT-N"] = [6, 6, , 15];
        animations["OP-SHOT-W"] = [7, 7, , 15];

        for (var i = 1; i < 3; i++) {
            var offset = 48 * i;
            // still
            animations["OP-" + i + "-S-S"] = 32 + offset;
            animations["OP-" + i + "-S-SE"] = 33 + offset;
            animations["OP-" + i + "-S-E"] = 34 + offset;
            animations["OP-" + i + "-S-NE"] = 35 + offset;
            animations["OP-" + i + "-S-N"] = 36 + offset;
            animations["OP-" + i + "-S-NW"] = 37 + offset;
            animations["OP-" + i + "-S-W"] = 38 + offset;
            animations["OP-" + i + "-S-SW"] = 39 + offset;
            // moving
            animations["OP-" + i + "-M-S"] = [0 + offset, 3 + offset, , 2];
            animations["OP-" + i + "-M-SE"] = [4 + offset, 7 + offset, , 2];
            animations["OP-" + i + "-M-E"] = [8 + offset, 11 + offset, , 2];
            animations["OP-" + i + "-M-NE"] = [12 + offset, 15 + offset, , 2];
            animations["OP-" + i + "-M-N"] = [16 + offset, 19 + offset, , 2];
            animations["OP-" + i + "-M-NW"] = [20 + offset, 23 + offset, , 2];
            animations["OP-" + i + "-M-W"] = [24 + offset, 27 + offset, , 2];
            animations["OP-" + i + "-M-SW"] = [28 + offset, 31 + offset, , 2];
            // firing
            animations["OP-FIRE-" + i + "-S-S"] = [40 + offset, 40 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-SE"] = [41 + offset, 41 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-E"] = [42 + offset, 42 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-NE"] = [43 + offset, 43 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-N"] = [44 + offset, 44 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-NW"] = [45 + offset, 45 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-W"] = [46 + offset, 46 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-SW"] = [47 + offset, 47 + offset, , 5];
        }

        var operative_sprite_sheet = new createjs.SpriteSheet({
            animations: animations,
            images: ["person-operative.png"],
            frames: {
                "regX": 0,
                "height": 36,
                "count": 192,
                "regY": 0,
                "width": 33
            }
        });

        var police_sprite_sheet = new createjs.SpriteSheet({
            animations: animations,
            images: ["person-police.png"],
            frames: {
                "regX": 0,
                "height": 36,
                "count": 192,
                "regY": 0,
                "width": 33
            }
        });


        // SETUP GENERAL

        var animations = {};

        animations["OP-DEAD"] = 3;
        animations["OP-DYING"] = [0, 3, "OP-DEAD", 25];
        animations["OP-SHOT-S"] = [4, 4, , 15];
        animations["OP-SHOT-E"] = [5, 5, , 15];
        animations["OP-SHOT-N"] = [6, 6, , 15];
        animations["OP-SHOT-W"] = [7, 7, , 15];

        for (var i = 1; i < 2; i++) {
            var offset = 48 * i;
            // still
            animations["OP-" + i + "-S-S"] = 32 + offset;
            animations["OP-" + i + "-S-SE"] = 33 + offset;
            animations["OP-" + i + "-S-E"] = 34 + offset;
            animations["OP-" + i + "-S-NE"] = 35 + offset;
            animations["OP-" + i + "-S-N"] = 36 + offset;
            animations["OP-" + i + "-S-NW"] = 37 + offset;
            animations["OP-" + i + "-S-W"] = 38 + offset;
            animations["OP-" + i + "-S-SW"] = 39 + offset;
            // moving
            animations["OP-" + i + "-M-S"] = [0 + offset, 3 + offset, , 2];
            animations["OP-" + i + "-M-SE"] = [4 + offset, 7 + offset, , 2];
            animations["OP-" + i + "-M-E"] = [8 + offset, 11 + offset, , 2];
            animations["OP-" + i + "-M-NE"] = [12 + offset, 15 + offset, , 2];
            animations["OP-" + i + "-M-N"] = [16 + offset, 19 + offset, , 2];
            animations["OP-" + i + "-M-NW"] = [20 + offset, 23 + offset, , 2];
            animations["OP-" + i + "-M-W"] = [24 + offset, 27 + offset, , 2];
            animations["OP-" + i + "-M-SW"] = [28 + offset, 31 + offset, , 2];
            // firing
            animations["OP-FIRE-" + i + "-S-S"] = [40 + offset, 40 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-SE"] = [41 + offset, 41 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-E"] = [42 + offset, 42 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-NE"] = [43 + offset, 43 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-N"] = [44 + offset, 44 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-NW"] = [45 + offset, 45 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-W"] = [46 + offset, 46 + offset, , 5];
            animations["OP-FIRE-" + i + "-S-SW"] = [47 + offset, 47 + offset, , 5];
        }

        var general_sprite_sheet = new createjs.SpriteSheet({
            animations: animations,
            images: ["person-general.png"],
            frames: {
                "regX": 0,
                "height": 36,
                "count": 192,
                "regY": 0,
                "width": 33
            }
        });

        animations = null;

        var player_start_position = [];

        for (var i = 0; i < this.LevelDefinition[CONST.AreaType.Entities].length; i++) {
            var ent = this.LevelDefinition[CONST.AreaType.Entities][i];

            switch (ent.type) {
                case CONST.EntityType.PlayerStart:
                    // add the operatives				
                    for (var j = 0; j < 4; j++) { // DEBUG- should be 4 operatives!
                        var op = new Operative(operative_sprite_sheet, this.LevelContainer, this.MessContainer, this.LevelDefinition[CONST.AreaType.Blocked], 'O' + (j + 1), this.NPCs);

                        op.Graphic.scaleX = op.Graphic.scaleY = 0.5;

                        op.OnMoveCallBack = this._OnPlayerMoveCallBack(self);

                        op.OnHealthUpdateCallBack = this._OnHealthUpdateCallBack(self, ent.type);

                        op.SetWeapon(CONST.Weapon.Pistol);

                        this.ObjectiveData.PlayerOperatives++;

                        this.Player.AddOperativeToTeam(op, 0);
                        this.PeopleToRender.push(op);
                    }
                    this.Player.SelectTeam(0);
                    this.Player.Teams[0].SetPosition(ent.position);

                    this.ScrollManager.CenterAtPoint(ent.position[0], ent.position[1]);

                    player_start_position = ent.position;
                    break;
                case CONST.EntityType.Extraction:

                    this.Extraction = { x: ent.position[0], y: ent.position[1] };

                    break;
                case CONST.EntityType.Enemy:
                    var enemy = new EnemyOperative(operative_sprite_sheet, this.LevelContainer, this.MessContainer, this.LevelDefinition[CONST.AreaType.Blocked], this.Player, this.ObjectiveData, this.NPCs);

                    enemy.Name = 'E' + i;

                    enemy.Graphic.scaleX = enemy.Graphic.scaleY = 0.5;

                    enemy.OnHealthUpdateCallBack = this._OnHealthUpdateCallBack(self, ent.type);

                    enemy.OnTargetAcquired = this._OnEnemyTargetAcquired(self, op);

                    this.ObjectiveData.Enemies++;

                    this.NPCs.push(enemy);
                    this.PeopleToRender.push(enemy);
                    enemy.SetPosition(ent.position);
                    break;
                case CONST.EntityType.Rescue:
                    var rescue = new RescueTarget(general_sprite_sheet, this.LevelContainer, this.MessContainer, this.LevelDefinition[CONST.AreaType.Blocked], this.Player, this.ObjectiveData, this.NPCs);

                    rescue.Graphic.scaleX = rescue.Graphic.scaleY = 0.5;

                    this.ObjectiveData.ToRescue++;

                    rescue.OnHealthUpdateCallBack = this._OnHealthUpdateCallBack(self, ent.type);

                    rescue.OnCollected = this._OnRescueCollected(self, rescue);

                    rescue.Name = 'R' + this.ObjectiveData.ToRescue;

                    this.NPCs.push(rescue);
                    this.PeopleToRender.push(rescue);
                    rescue.SetPosition(ent.position);

                    break;
                case CONST.EntityType.Assassinate:
                    var a_boss = new EnemyStaticBoss(police_sprite_sheet, this.LevelContainer, this.MessContainer, this.LevelDefinition[CONST.AreaType.Blocked], this.Player, this.ObjectiveData, this.NPCs);

                    this.ObjectiveData.AssassinationTargets++;

                    a_boss.Graphic.scaleX = a_boss.Graphic.scaleY = 0.5;
                    a_boss.Name = 'A' + this.ObjectiveData.AssassinationTargets;

                    a_boss.OnHealthUpdateCallBack = this._OnHealthUpdateCallBack(self, ent.type);

                    a_boss.OnTargetAcquired = this._OnEnemyTargetAcquired(self, op);

                    this.NPCs.push(a_boss);
                    this.PeopleToRender.push(a_boss);
                    a_boss.SetPosition(ent.position);
                    break;
            }

        }

        if (typeof (this.Extraction) == 'undefined') {
            this.Extraction = player_start_position;
        }

        this.MiniMap.Init();
        this.TeamPanel.Init();
        this.MessContainer.cache(0, 0, this.LevelBase.image.width, this.LevelBase.image.height); // gets the cache ready..

        general_sprite_sheet = null;
        operative_sprite_sheet = null;
        police_sprite_sheet = null;
        player_start_position = null;
        options = null;
    },
    _OnPlayerMoveCallBack: function (self) {
        return function (op, x, y) {
            self.MiniMap.UpdateOperative(op.Name, x, y);
        };
    },
    _OnHealthUpdateCallBack: function (self, operative_type) {
        return function (op, health) {
            if (operative_type == CONST.EntityType.PlayerStart || operative_type == CONST.EntityType.Rescue) {
                self.TeamPanel.UpdateOperativeStats(op);
            }

            if (health < 1) {
                self.MiniMap.SetDead(op.Name);

                switch (operative_type) {
                    case CONST.EntityType.Rescue:
                        self.UpdateObjectives(CONST.ObjectiveUpdate.RescueKIA);
                        break;
                    case CONST.EntityType.PlayerStart:
                        self.UpdateObjectives(CONST.ObjectiveUpdate.PlayerOperativeKIA);
                        break;
                    case CONST.EntityType.Enemy:
                        self.UpdateObjectives(CONST.ObjectiveUpdate.EnemyKIA);
                        break;
                    case CONST.EntityType.Assassinate:
                        self.UpdateObjectives(CONST.ObjectiveUpdate.TargetAssassinated);
                        break;
                }

            }
        };
    },
    _OnEnemyTargetAcquired: function (self, op) {
        return function (op) {
            self.MiniMap.AddOperative(op, CONST.EntityType.Enemy);

            op.OnMoveCallBack = self._OnPlayerMoveCallBack(self);
        };
    },
    _OnRescueCollected: function (self, rescue) {
        return function () {
            self.UpdateObjectives(CONST.ObjectiveUpdate.Rescued);
            self.TeamPanel.Init();
            self.MiniMap.AddOperative(rescue, CONST.EntityType.Rescue);

            this.OnMoveCallBack = self._OnPlayerMoveCallBack(self);
        };
    },
    UpdateObjectives: function (ObjectiveUpdate) {

        var self = this;

        // objective status updates..
        switch (ObjectiveUpdate) {
            case CONST.ObjectiveUpdate.Rescued:
                this.ObjectiveData.Rescued++;
                break;
            case CONST.ObjectiveUpdate.RescueKIA:
                this.ObjectiveData.RescueKIA++;
                break;
            case CONST.ObjectiveUpdate.EnemyKIA:
                this.ObjectiveData.EnemiesKIA++;
                break;
            case CONST.ObjectiveUpdate.TargetAssassinated:
                this.ObjectiveData.AssassinationTargetsKIA++;
                break;
            case CONST.ObjectiveUpdate.PlayerOperativeKIA:
                this.ObjectiveData.PlayerOperativesKIA++;
                break;
        }

        if (ObjectiveUpdate == CONST.ObjectiveUpdate.Evacuated) {

            if (!this.mission_outcome_sound_played) {
                var sound = createjs.SoundJS.play('mission_completed');
                this.mission_outcome_sound_played = true;
            }

            this.SetObjectivePrompt('Mission Completed - Press Space Bar To Continue...', '0f0');
            this.ObjectiveData.TotalSeconds = createjs.Ticker.getTime() / 1000;
            document.onkeypress = this._OnSpaceBarEndGame(self);
        }
        else if (this.ObjectiveData.PlayerOperativesKIA == this.ObjectiveData.PlayerOperatives || this.ObjectiveData.RescueKIA > 0) {

            if (!this.mission_outcome_sound_played) {
                var sound = createjs.SoundJS.play('mission_failed');
                this.mission_outcome_sound_played = true;
            }

            this.SetObjectivePrompt('Mission Failed - Press Space Bar To Continue...', 'f00');
            this.ObjectiveData.Success = false;
            this.ObjectiveData.TotalSeconds = createjs.Ticker.getTime() / 1000;
            document.onkeypress = this._OnSpaceBarEndGame(self);
        }
        else if (this.ObjectiveData.ToRescue > this.ObjectiveData.Rescued) {
            this.SetObjectivePrompt('Recover Agent ' + this.ObjectiveData.Rescued + '/' + this.ObjectiveData.ToRescue);
            // find the rescue target
            for (var i = this.PeopleToRender.length; i--; ) {
                if (this.PeopleToRender[i] instanceof RescueTarget) {
                    this.MiniMap.SetObjectiveLocation(this.PeopleToRender[i].x, this.PeopleToRender[i].y);
                    break;
                }
            }

        }
        else if (this.ObjectiveData.AssassinationTargets > this.ObjectiveData.AssassinationTargetsKIA) {
            this.SetObjectivePrompt('Assassinate Targets ' + this.ObjectiveData.AssassinationTargetsKIA + '/' + this.ObjectiveData.AssassinationTargets);

            for (var i = this.PeopleToRender.length; i--; ) {
                if (this.PeopleToRender[i] instanceof EnemyStaticBoss) {
                    this.MiniMap.SetObjectiveLocation(this.PeopleToRender[i].x, this.PeopleToRender[i].y);
                    break;
                }
            }
        }
        else if (this.ObjectiveData.AssassinationTargets == 0 && this.ObjectiveData.ToRescue == 0 && this.ObjectiveData.Enemies > this.ObjectiveData.EnemiesKIA)
            this.SetObjectivePrompt('Eliminate All Operatives');
        else {

            this.SetObjectivePrompt('Evacuate', '00f');
            this.ExtractionActive = true;

            this.MiniMap.SetObjectiveLocation(this.Extraction.x, this.Extraction.y);
            this.MiniMap.AddExtraction(this.Extraction.x, this.Extraction.y, this.ExtractionPointRange);
        }

    },
    _OnSpaceBarEndGame: function (self) {
        return function (evt) {
            var k = evt ? evt.which : window.event.keyCode;
            if (k == 32)
                self.EndGame();
            evt = null;
            self = null;
        };
    },
    EndGame: function () {
        document.onkeypress = null;

        this.music.pause();
        this.music = null;

        createjs.Ticker.setPaused(true);
        createjs.Ticker.removeAllListeners();

        this.MiniMap.dispose();
        this.MiniMap = null;

        this.TeamPanel.dispose();
        this.TeamPanel = null;

        this.Player.dispose();
        this.Player = null;

        for (var i = this.NPCs.length; i--; )
            this.NPCs[i].dispose();
        this.NPCs = null;
        this.PeopleToRender = null;

        this.LevelContainer.removeAllChildren();
        this.Stage.removeAllChildren();
        this.Stage.clear();
        this.Stage.onMouseDown = null;
        this.Stage = null;

        this.LevelContainer = null;

        for (var i = this.GameProps.length; i--; )
            this.GameProps[i].dispose();
        this.GameProps = null;

        this.ObjectiveDisplay = null;

        this.mission_outcome_sound_played = false;

        this.ScrollManager.dispose();
        this.ScrollManager = null;

        this.EndGameCallback(this.ObjectiveData);

        this.ObjectiveData = null;

        this.LevelDefinition = null;
    },
    SetObjectivePrompt: function (text, highlight) {
        this.ObjectiveDisplay.innerText = text;

        if (typeof (highlight) !== 'undefined') {
            this.ObjectiveDisplay.parentNode.parentNode.style.backgroundColor = highlight;
            this.ObjectiveDisplay.parentNode.parentNode.style.color = 'fff';
            this.ObjectiveDisplay.parentNode.parentNode.style.fontWeight = 'bold';
        }
    },
    StartLevel: function () {

        var self = this;
        createjs.Ticker.init();
        createjs.Ticker.setPaused(false);
        createjs.Ticker.useRAF = true;
        createjs.Ticker.setFPS(30);
        createjs.Ticker.addListener(self);

        if (DEBUG_PATHS) {
            this.DebugRegionRenderer = new DebugRegionRenderer(this.LevelDefinition, this.LevelContainer, this.Stage);
            this.DebugRegionRenderer.RefreshOnScreenRegions(0);
        }
        if (DEBUG_3D) {
            if (this.DebugRegionRenderer == undefined)
                this.DebugRegionRenderer = new DebugRegionRenderer(this.LevelDefinition, this.LevelContainer, this.Stage);

            this.DebugRegionRenderer.RefreshOnScreenRegions(1);
        }

        this.Stage.update();
        this.UpdateObjectives();

        this.music = createjs.SoundJS.play(this.musicfile, 'music', 0, 0, -1, .7, 0); // start the musics
    },
    tick: function () { // by convention (createjs.Ticker)- do not rename!

        this.Update();

    },
    Update: function () {
        // do we need to scroll?
        if (this.Stage.mouseInBounds)
            this.ScrollManager.Update();

        this.Player.Update();

        this.PeopleToRender.sort(function (b, a) { return a.y - b.y; });

        // loop through each person, ordered by y coord working our way down the screen
        for (var j = this.PeopleToRender.length; j--; ) {
            var man = this.PeopleToRender[j];
            this.LevelContainer.addChild(this.PeopleToRender[j].Graphic);

            for (var i = this.GameProps.length; i--; ) {
                if ( // is the man inside any of the "3d" elements?  if so, draw that element over him
						this.GameProps[i].isPointInPoly({ x: man.x, y: man.y + man.Height }) ||
						this.GameProps[i].isPointInPoly({ x: man.x + man.Width, y: man.y + man.Height })
						) {
                    if (!DEBUG_PATHS)
                        this.LevelContainer.addChild(this.GameProps[i].Bitmap);
                }
            }
        }

        if (this.ExtractionActive) {
            var evac_count = 0;
            for (var i = this.Player.Teams.length; i--; ) {
                for (var j = this.Player.Teams[i].Operatives.length; j--; ) {
                    var op = this.Player.Teams[i].Operatives[j];
                    if (!op.IsDead() && op.GetDistance(this.Extraction) <= this.ExtractionPointRange) {
                        evac_count++;
                    }
                }
            }
            if (evac_count == (this.ObjectiveData.ToRescue - this.ObjectiveData.RescueKIA) + (this.ObjectiveData.PlayerOperatives - this.ObjectiveData.PlayerOperativesKIA)) {  // everyone out!
                this.UpdateObjectives(CONST.ObjectiveUpdate.Evacuated);
            }
        }

        this.MiniMap.Update();

        for (var i = this.NPCs.length; i--; )
            this.NPCs[i].Update();

        var html = 'Mission Time Elapsed : ';
        if (!this.ExtractionActive && this.ObjectiveData.Success) {
            var seconds = createjs.Ticker.getTime() / 1000;
            var numminutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
            var numseconds = ((((seconds % 31536000) % 86400) % 3600) % 60).toFixed(2);
            html += numminutes + ':' + numseconds;
            this.TimePanel.innerHTML = html;

            html = null;
            numseconds = null;
            numminutes = null;
            seconds = null;
        }

        this.Stage.update();
    }
};

window.DEBUG_PATHS = false;
window.DEBUG_3D = false;
window.DEBUG_AI = false;
window.DEBUG_COMBAT = true;