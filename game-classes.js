"use strict";

window.CONST = {
	AreaType : {
		All: undefined,
		Blocked : 0,
		ThreeD : 1,
		Flammable : 2,
		Entities : 3
	},
	Coordinates : {
		x : 0,
		y : 1
	},
	EntityType : {
		PlayerStart: 0,
		Enemy: 1,
		Police: 2,
		Civilian: 3,
		Car: 4,
		Rescue: 5,
		Assassinate: 6,
		Extraction: 99
	},
	Weapon : {
		None : 0,
		Pistol : 1,
		Shotgun : 2,
		MiniGun : 3,
		FlameThrower : 4,
		Laser : 5
	},
	ObjectiveUpdate: {
		None: undefined,
		Rescued: 0,
		RescueKIA: 1,
		EnemyKIA : 2,
		TargetAssassinated : 3,
		PlayerOperativeKIA : 4,
		Evacuated : 99
	}
};

var TeamManagementPanel = function(player_ref, html_container_id) {
	this.PlayerRef = player_ref;
    player_ref = null;

	this.Container = $('#' + html_container_id);
    html_container_id = null;
};
TeamManagementPanel.prototype = {
	Init: function() {
		this.TeamList = $('<ul></ul>');
		
		this.Container
			.empty()
			.append(this.TeamList);
			
		var i = 0;
		
		for(i = 0; i < this.PlayerRef.Teams.length; i++) {
			this.SetupTeam(i, this.PlayerRef.Teams[i]);
			
			for (var j = 0; j < this.PlayerRef.Teams[i].Operatives.length; j++)
			{
				this.AddOperativeToTeam(this.PlayerRef.Teams[i].Operatives[j], i);
			}
		}
	},
	SetupTeam: function(i, team) {
		var self = this;
			
		var team_li = $('<li id="team' + i + '"' + (this.PlayerRef.SelectedTeam == i ? ' class="selected"' : '') + '>Team #' + (i + 1) + '<ul class="op-list"></ul><span class="empty">Drag operative here to create team</span></li>')
			.on('drop', function(e) {
				e.preventDefault();
				var id= e.originalEvent.dataTransfer.getData('id');
				var op = $('#' + id).data('op');
				
				self.PlayerRef.MoveOperativeToTeam(op, i);
				
				self.Init();
			})
			.on('dragover', function(e) { e.preventDefault() })
			.on('click', function(e) { 
				self.PlayerRef.SelectTeam(i);
				self.Init();
			});
			
		$('ul:first', this.Container).append(team_li);
	},
	RemoveOperative: function(op, team) {
		$('#op-' + op.Name).remove();
	},
	AddOperativeToTeam: function(op, team) {
		$('#team' + team + ' .empty', this.Container)
			.hide();
		
		var op_html = $('<li id="op-' + op.Name + '" draggable="true">' + op.Name + '<br /><span class="health">H:' + op.Health + '</span></li>')
			.on('dragstart', function(e) { 
				e.originalEvent.dataTransfer.setData('id', 'op-' + op.Name); 
			})
			.data('op', op);
			
		$('#team' + team + ' .op-list', this.Container)
			.append(op_html);
	},
	UpdateOperativeStats: function(op) {
		if (op.Health < 1)
			$('#op-' + op.Name + ' .health').text("DEAD");
		else
			$('#op-' + op.Name + ' .health').text('H:' + op.Health);
	},
    dispose: function() {
        this.TeamList = null;
        this.Container = null;
        this.PlayerRef = null;
    }
};

var Operative = function(sprite_sheet,  container_ref, mess_container_ref, non_walkable_regions, name, npc_ref) {

	var self = this;
	
	this.Weapon = undefined;
	
	this.SetWeapon(window.CONST.Weapon.None);
	
	this.CurrentDirection = "S";	
	
	this.OnMoveCallBack = undefined; // function(operative, x, y)
	this.OnHealthUpdateCallBack = undefined; // function(operative, new_health);
	
	//WebWorker- set up message handlers....
	this.RouteFinder = new Worker('DijkstraRouteFinder.js');
	this.RouteFinder.onmessage = this._RouteFinderOnMessage(self);

	this.RouteFinder.postMessage({ method : 'init', allPolys : non_walkable_regions });
    non_walkable_regions = null;
	this.CalculatingRoute = false;
	
	this.Graphic = new createjs.BitmapAnimation(sprite_sheet);
    sprite_sheet = null;
	
	this.SetAnimation( this.BuildAnimationName(false));
		
	this.CurrentRoute = undefined; // TODO- an array of destinations used for plotting routes around obsticles
	
	this.Height = 28 / 2;
	this.Width = 20 / 2;
	this.HalfWidth = this.Width/2;
	
	this.x = 0;
	this.y = 0;
	
	this.Health = 100;
	this.MoveSpeed = 1;
	this.Destination = undefined;

	this.Name = name;
    name = null;

	this.Container = container_ref;
    container_ref = null;

	this.MessContainer = mess_container_ref;
    mess_container_ref = null;

	this.NPCsRef = npc_ref;
    npc_ref = null;
	
	this.Container.addChild(this.Graphic);
	
	if (DEBUG_3D)
	{
		this.DebugGraphic = new createjs.Shape(new createjs.Graphics().beginStroke("#F00").drawRect(0, 0, this.Width, this.Height));
		this.Container.addChild(this.DebugGraphic);
	}
};
Operative.prototype = {
    _RouteFinderOnMessage: function(self) {
        return function(msg) {
            self._CalculateRouteCallBack(msg);
            msg = null;
        };
    },
	Update: function() {
	
		if (this.Health < 1)
			return;
	
		if (this.Destination !== undefined)
		{
			var x_diff = this.x - this.Destination[0],
				y_diff = this.y - this.Destination[1],
				x_diff_abs = Math.abs(x_diff),
				y_diff_abs = Math.abs(y_diff),
				x_step = 0,
				y_step = 0;
			
			if (x_diff_abs > this.MoveSpeed || y_diff_abs > this.MoveSpeed) {
				if (Math.abs(x_diff) > Math.abs(y_diff)) {
					x_step = this.MoveSpeed;
					y_step = y_diff_abs / x_diff_abs;
				}
				else {
					y_step = this.MoveSpeed;
					x_step = x_diff_abs / y_diff_abs;
				}
				
				if (x_diff > 0) x_step *= -1;
				if (y_diff > 0) y_step *= -1;
			}
			else {
				// we have arrived!
				x_step = x_diff;
				y_step = y_diff;
				this.Destination = undefined;
				this.SetAnimation(this.BuildAnimationName(false));
			}
			
			this.x += x_step;
			this.y += y_step;
			
			if (this.OnMoveCallBack != undefined)
				this.OnMoveCallBack(this, this.x, this.y);
			
			this.UpdateGraphicLocation();
		}
		else
		{
			if (this.CurrentRoute != undefined)
			{
				if (this.CurrentRoute.length == 0)
					this.CurrentRoute = undefined;
				else
				{
					this.MoveTo(this.CurrentRoute.shift());
				}
			}
		}
	},
	SubtractHealth: function(amount, damage_origin) {
		var self = this;
		
		this.Health -= amount;
		
		if (this.IsDead())
		{
			// we be dead!
			this.SetDead();
		}
		
		if (typeof(damage_origin) !== 'undefined')
		{
			var oof_anim = 'OP-SHOT-';
			
			var degs = Math.atan2(this.y - damage_origin[1], damage_origin[0] - this.x) * (180 / Math.PI);

			if (degs >= 45 && degs <= 135)
				oof_anim += "N";
			else if (degs <= 45 && degs >= -45)
				oof_anim += "E";
			else if (degs <= -45 && degs >= -135)
				oof_anim += "S";
			else if (degs <= 135 || degs >= 135)
				oof_anim += "W";
			
			// show one of the "ooof" animations
			this.Graphic.onAnimationEnd = function() {
				// once the oof has finished, remove the call back and update the animation (if a destination is set, then the update method will reset the animation
				self.SetAnimation(self.BuildAnimationName( (typeof(self.Destination) !== 'undefined') ));
					
				self.onAnimationEnd = undefined;
				self.MoveSpeed = 1;
			};

			this.SetAnimation(oof_anim);
			this.MoveSpeed = 0;
           
            var splatter_degs = degs + 180;
            if (splatter_degs > 360)
                splatter_degs -= 360;
            var splatter_rads = splatter_degs * 0.0174532925;

			for (var i = 0; i < (Math.random() * 5); i ++)
			{
				var dist = Math.random() * 50;
				
				var s1 = new createjs.Shape(
					new createjs.Graphics()
					.beginFill(createjs.Graphics.getRGB(140,0,0))
					.drawCircle(0,0,Math.random() * 3)
				);
				s1.x = this.x + (dist * Math.cos(splatter_rads));
				s1.y = this.y + (dist * Math.sin(splatter_rads));
				
				this.MessContainer.removeAllChildren();
				this.MessContainer.addChild(s1);
				this.MessContainer.updateCache('source-over');
			} 
		}
		
		if (this.OnHealthUpdateCallBack !== undefined)
		{
			this.OnHealthUpdateCallBack(this, this.Health);
		}
	},
	SetDead: function() {
		this.SetAnimation(this.BuildAnimationName(false));
	},
	SetDestination: function (xy) {

        if (this.IsDead())
            return;

		if (!this.CalculatingRoute) {
			this.CalculatingRoute = true;
			
			this.RouteFinder.postMessage({ 
				method:'shortestPath', 
				sx : this.x,
				sy : this.y, 
				dx : xy[0], 
				dy : xy[1]
			});
		}
		
	},
	_CalculateRouteCallBack: function(msg) {
	
		var e = msg.data;
		
		if (e.method == 'shortestPath') {
		
			this.CalculatingRoute = false;
						
			if (!e.result)
				return; // not possible to get there!
				
			this.CurrentRoute = undefined;
				
			if (DEBUG_PATHS)
				this.drawPath(this.Container, this.x, this.y, e.targetXY[0], e.targetXY[1], e.path);
			
			if (e.path.length > 0) {
				e.path.push(e.targetXY);
				this.CurrentRoute = e.path;
				this.MoveTo(this.CurrentRoute.shift());
			}
			else {
				this.MoveTo(e.targetXY);
			}
		}

        msg = null;
        e = null;
	},
	drawPath: function(container, sx, sy, dx, dy, path) {
		var s = new createjs.Shape();
		var g = s.graphics;
		g.setStrokeStyle(2, 'round', 'round');

		g.beginStroke(createjs.Graphics.getRGB(255,0, 0));
		
		container.addChild(s);
		
		g.moveTo(sx, sy);
		
		for(var i = 0; i < path.length; i++)
		{
			g.lineTo(path[i][0], path[i][1]);
		}
		
		g.lineTo(dx, dy);
	},
	MoveTo: function(xy) {
		this.Destination = xy;
		
		this.SetFacing(xy);
			
		//if (this.Name == 1) console.log('COORDS=' + (xy[0] - this.x) + ':' +  (this.y - xy[1]) + ' - DEGS=' + degs + ' DIR=' + this.CurrentDirection);
		
		// start the movement animation
		var anim = this.BuildAnimationName(true);
		this.SetAnimation(anim);
        anim = null;
	},
	SetFacing: function(xy) {
		// work out the direction- get degress in a range of -180 => +180
		var degs = Math.atan2(this.y - xy[1], xy[0] - this.x) * (180 / Math.PI);
		
		if (degs >= 68 && degs <= 112)
			this.CurrentDirection = "N"; //"E";
		else if (degs >= 113 && degs <= 157)
			this.CurrentDirection = "NW"; //"SE";
		else if (degs >= 158 || degs <= -158)
			this.CurrentDirection = "W"; //"S";
		else if (degs <= -133 && degs >= -157)
			this.CurrentDirection = "SW"; //"SW";
		else if (degs <= -68 && degs >= -112)
			this.CurrentDirection = "S"; //"W";
		else if (degs <= -21 && degs >= -68)
			this.CurrentDirection = "SE"; //"NW";
		else if (degs >= -22 && degs <= 22)
			this.CurrentDirection = "E"; //"N";
		else if (degs >= 23 && degs <= 67)
			this.CurrentDirection = "NE"; //"NE";
			
	},
	SetPosition: function(xy) {

		this.x = xy[0];
		this.y = xy[1];
		
		this.UpdateGraphicLocation();

	},
	SetWeapon: function(w) {
		switch(w)
		{
			case window.CONST.Weapon.None:
				this.Weapon = {
					type : window.CONST.Weapon.None,
					range : 0,
					damage : 0,
					frequency : 0
				};
				break;
			case window.CONST.Weapon.Pistol:
				this.Weapon = {
					type : window.CONST.Weapon.Pistol,
					range : 100,
					damage : 10,
					frequency : 1000
				};
				break;
			case window.CONST.Weapon.Shotgun:
				this.Weapon = {
					type : window.CONST.Weapon.Shotgun,
					range : 50,
					damage : 50,
					frequency : 1500
				};
				break;
			case window.CONST.Weapon.MiniGun:
				this.Weapon = {
					type : window.CONST.Weapon.MiniGun,
					range : 100,
					damage : 10,
					frequency : 200
				};
				break;
		}
	},
	UpdateGraphicLocation: function() {
		this.Graphic.x = this.x ;//+ this.HalfWidth;
		this.Graphic.y = this.y ;//+ this.Height;
		
		if (DEBUG_3D)
		{
			this.DebugGraphic.x = this.x;
			this.DebugGraphic.y = this.y;
		}
	},
	BuildAnimationName: function(moving) {
		if (this.IsDead())
		{
			return "OP-DYING";
		}
		else
		{
			return "OP-" + (this.Weapon.type + 1) + '-' + (moving ? 'M' : 'S') + '-' + this.CurrentDirection;
		}
	},
	SetAnimation: function(animation) {
		if (this.CurrentAnimation !== animation) {
			this.Graphic.gotoAndPlay(animation);
			this.CurrentAnimation = animation;
		}
	},
	IsDead: function() {
		return this.Health < 1;
	},
	Shoot: function(xy) { // used for player initiated shoot events- not ai... although I suppose the Ai could also use it?

		var rads = Math.atan2(xy[1] - this.y, xy[0] - this.x ); // what angle is the shot taken at?
		// now project this along to maximum weapon range
		var shot = [];
		shot[0] = this.x + (this.Weapon.range * Math.cos(rads));
		shot[1] = this.y + (this.Weapon.range * Math.sin(rads));
			
		
		var s1 = new createjs.Shape(
			new createjs.Graphics()
			.beginFill(createjs.Graphics.getRGB(0,0,0))
			.drawCircle(0,0,1)
		);
        s1.x = shot[0];
		s1.y = shot[1];

		this.MessContainer.removeAllChildren(); 
		this.MessContainer.addChild(s1); 
		this.MessContainer.updateCache('source-over'); 
		
		this.SetFacing(shot);
		//play the shooting animation
		this.PlayShootingAnimation();
		
			
		for(var i = 0; i < this.NPCsRef.length; i++) 
		{
			var npc = this.NPCsRef[i];
			
			if (npc.IsDead() || npc instanceof RescueTarget)
				continue;
				
			var hit = false;

			// check npc is in range first...
			
			if (this.IntersectLineLine([this.x, this.y], shot, [npc.x, npc.y] , [npc.x + npc.Width, npc.y]))
			{
				hit = true;
			}
			else if (this.IntersectLineLine([this.x, this.y], shot, [npc.x + npc.Width, npc.y], [npc.x + npc.Width, npc.y + npc.Height]))
			{
				hit = true;
			}
			else if (this.IntersectLineLine([this.x, this.y], shot, [npc.x + npc.Width, npc.y + npc.Height], [npc.x, npc.y + npc.Height]))
			{
				hit = true;
			}
			else if (this.IntersectLineLine([this.x, this.y], shot, [npc.x, npc.y + npc.Height], [npc.x, npc.y]))
			{
				hit = true;
			}
			
			if (hit)
			{
				//console.log('hit');
				// players weapons do half the damage to stop it being too easy...
				npc.SubtractHealth((this.Weapon.damage / 2), [this.x, this.y]);
			}
		}
	},
	PlayShootingAnimation: function() {
		if (this.Graphic.onAnimationEnd == undefined) {
            var self = this;
			this.Graphic.onAnimationEnd = function() {
				// once the oof has finished, remove the call back and update the animation (if a destination is set, then the update method will reset the animation
				self.SetAnimation(self.BuildAnimationName( (typeof(self.Destination) !== 'undefined') ));
					
				self.onAnimationEnd = null;
			};
		}
		this.SetAnimation('OP-FIRE-' + (this.Weapon.type + 1) + '-S-' + this.CurrentDirection);
	},
	IntersectLineLine : function(a1, a2, b1, b2) {
		var ua_t = (b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0]);
		var ub_t = (a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0]);
		var u_b  = (b2[1] - b1[1]) * (a2[0] - a1[0]) - (b2[0] - b1[0]) * (a2[1] - a1[1]);

		if ( u_b != 0 ) {
			var ua = ua_t / u_b;
			var ub = ub_t / u_b;

			if ( 0 <= ua && ua <= 1 && 0 <= ub && ub <= 1 ) {
				return [a1[0] + ua * (a2[0] - a1[0]), a1[1] + ua * (a2[1] - a1[1])];
			} 
		} 

		return null;
	},
	GetDistance: function(tgt) {
		var x_diff = Math.abs(this.x - tgt.x);
		var y_diff = Math.abs(this.y - tgt.y);
		return Math.abs(Math.sqrt(x_diff * x_diff + y_diff * y_diff));
	},
    dispose: function() {
        this.Destination = null;
		this.CurrentRoute = null;
        if (this.RouteFinder != null) {
		    this.RouteFinder.terminate();
            this.RouteFinder.onmessage = null;
            this.RouteFinder = null;
        }
        this.CalculatingRoute = null;
        this.OnMoveCallBack = null; 
	    this.OnHealthUpdateCallBack = null; 
        this.Graphic = null;
    }
};

function RescueTarget (sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, player_ref, objectives, npc_ref){
	Operative.call(this, sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, "", npc_ref); // call parent constructor : https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/call
	
    this.PlayerRef = player_ref;
    player_ref = null;

	this.ObjectivesRef = objectives;
    objectives = null;

	this.VisualRange = 50;
	this.MoveSpeed = 0.7;
	
	this.OnCollected = undefined;
	
	this.Collected = false;
	
	if (DEBUG_AI)
	{
		this.DebugAiGraphic = new createjs.Shape(new createjs.Graphics()
			.beginStroke(createjs.Graphics.getRGB(0,0,255,.5))
			.setStrokeStyle ( 3 )
			.drawCircle(0, 0, this.VisualRange));
			
		this.Container.addChild(this.DebugAiGraphic);
	}
}
RescueTarget.prototype = Object.create(Operative.prototype);
RescueTarget.prototype.constructor = RescueTarget;
RescueTarget.prototype.Update = function() {

	if (this.Health < 1)
		return;

	if (!this.Collected)
	{
		// is there an operative close to me?
		for(var i = 0; i < this.PlayerRef.Teams.length; i++) {
			for (var j = 0; j < this.PlayerRef.Teams[i].Operatives.length; j++) {
				if (this.GetDistance(this.PlayerRef.Teams[i].Operatives[j]) <= this.VisualRange)
				{
					// if so, join his team!
					this.PlayerRef.Teams[i].AttachOperative(this);
					
					if (this.OnCollected !== undefined)
						this.OnCollected();
					
					this.Collected = true;
					break;
				}
			}
			
			if (this.Collected)
				break;
		}
		
	}
	
	
	Operative.prototype.Update.call(this);
};
RescueTarget.prototype.UpdateGraphicLocation = function() {

	Operative.prototype.UpdateGraphicLocation.call(this);
	
	if (DEBUG_AI)
	{
		this.DebugAiGraphic.x = this.x;
		this.DebugAiGraphic.y = this.y;
	}
};
RescueTarget.prototype.Shoot = function(xy) {
	return; // a pacifist...
};


function EnemyOperative (sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, player_ref, objectives, npc_ref){
	Operative.call(this, sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, "", npc_ref); // call parent constructor : https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/call
	
    this.PlayerRef = player_ref;
    player_ref = null;

	this.ObjectivesRef = objectives;
    objectives = null;

	this.VisualRange = 200;
	this.Target = undefined;
	this.TargetReported = false;
	this.LastShotFired = 0;
	
	this.OnTargetAcquired = undefined;
	
	if (DEBUG_AI)
	{
		this.DebugAiGraphic = new createjs.Shape(new createjs.Graphics()
			.beginStroke(createjs.Graphics.getRGB(255,0,0,.5))
			.setStrokeStyle ( 3 )
			.drawCircle(0, 0, this.VisualRange)
			.beginFill(createjs.Graphics.getRGB(255,0,0,.5))
			.drawCircle(0,0,this.Weapon.range));
			
		this.Container.addChild(this.DebugAiGraphic);
	}
};
EnemyOperative.prototype = Object.create(Operative.prototype);
EnemyOperative.prototype.constructor = EnemyOperative;
EnemyOperative.prototype.SetWeapon = function(w) {
		Operative.prototype.SetWeapon.call(this, w);
		
		if (DEBUG_AI && this.Container !== undefined)
		{
			this.Container.removeChild(this.DebugAiGraphic);
			this.DebugAiGraphic = new createjs.Shape(new createjs.Graphics()
				.beginStroke(createjs.Graphics.getRGB(255,0,0,.5))
				.setStrokeStyle ( 3 )
				.drawCircle(0, 0, this.VisualRange)
				.beginFill(createjs.Graphics.getRGB(255,0,0,.5))
				.drawCircle(0,0,this.Weapon.range));
				
			this.Container.addChild(this.DebugAiGraphic);
		}
	},
EnemyOperative.prototype._CalculateRouteCallBack = function(msg) {
	var e = msg.data;
		
	if (e.method == 'shortestPath') 
	{
	
		if (e.path.length > 2)
		{
			this.CalculatingRoute = false;
			this.Target = undefined;
			return; // no good- need to maintain the illusion of line of sight
		}
		
		if (!this.TargetReported) { // we can get there- register ourselves 
			this.OnTargetAcquired(this);
			this.TargetReported = true;
		}
		
	}
		
	Operative.prototype._CalculateRouteCallBack.call(this, msg);
};
EnemyOperative.prototype.FindTarget = function() {
	var potentials = [];
	
	for(var i = this.PlayerRef.Teams.length; i--; )
	{
		for(var j = this.PlayerRef.Teams[i].Operatives.length; j--; ) {
			var op = this.PlayerRef.Teams[i].Operatives[j];
			if (!op.IsDead())
			{
				var dist = this.GetDistance(op);
				if (dist < this.VisualRange)
				{
					if (op instanceof RescueTarget)
					{
						// jackpot!  I'll definitely have him!
						return op;
					}
					// so they are in range, but is our view obstructed by any of the do-not-walk zones?
					// if so assume they are behind a building or some such and do not pursue
					
					// add to potential list
					potentials.push({dist: dist, op: op});
				}
			}
		}
	}
	
	if (potentials.length < 1)
	{
		return undefined;
	}
	else if (potentials.length == 1)
	{
		return potentials[0].op;
	}
	else if (potentials.length > 1) 
	{ 
		// out of the potential targets, choose the closest
		potentials.sort(function(a, b) { return a.dist - b.dist; });
		return potentials[0].op;
	}
};
EnemyOperative.prototype.Update = function() {

	if (this.Health < 1)
		return;

	if (this.Target == undefined)
	{
		// is there a player operative within range?
		this.SetWeapon(CONST.Weapon.None);
		
		var op = this.FindTarget();
		
		if (op !== undefined)
		{
			this.Target = op;
			this.SetWeapon(CONST.Weapon.Pistol);
		}
	}
	else
	{
		if (this.Target.IsDead())
		{	// He's dead, Jim!
			this.Target = undefined;
		}
		else 
		{
			var dist = this.GetDistance(this.Target);
			
			if (dist > this.VisualRange)
			{	// we lost him!
				this.Target = undefined;
				this.TargetReported = false;
			}
			else if (dist > this.Weapon.range) 
			{ 	// get closer...
				
				if (this.CurrentRoute == undefined && !this.CalculatingRoute)
				{	// are we already en-route, or thinking about how to get there?
					if (this.Target.Destination !== undefined)
					{
						this.SetDestination([this.Target.Destination[0], this.Target.Destination[1]]);
					}
					else
					{
						this.SetDestination([this.Target.x, this.Target.y]);
					}
				}
			}
			else
			{	// Attack!
			
				if (this.Destination == undefined) // if we're still, make sure we are facing in the correct direction
				{
					this.FaceTarget();
				}
				
				this.Shoot(dist);
			}
		}
	}
	
	Operative.prototype.Update.call(this);
};
EnemyOperative.prototype.FaceTarget = function() {
	var direction= this.CurrentDirection;
	this.SetFacing([this.Target.x, this.Target.y]);
	
	if (this.CurrentDirection != direction)
		this.SetAnimation(this.BuildAnimationName(false));
};
EnemyOperative.prototype.Shoot = function(distance_from_target) {
	var time = new Date().getTime();
				
	if ((time - this.LastShotFired) > this.Weapon.frequency)
	{
		// calculate chances of hitting - sliding scale from max attack range to target position; min is 0.5
		var min_chance = 0.5;
		var min_hit_value = (distance_from_target / this.Weapon.range) * min_chance; // min value is 0 - maximum value is 0.5
		var did_we_hit = Math.random() >= min_hit_value;
		
		var bang = createjs.SoundJS.play('gunshot');
		
		this.SetFacing([this.Target.x, this.Target.y]);
		this.PlayShootingAnimation();
		
		// subtract health from target if this was a hit
		if (did_we_hit)
			this.Target.SubtractHealth(this.Weapon.damage, [this.x, this.y]);
			
		this.LastShotFired = time;
	}
};
EnemyOperative.prototype.UpdateGraphicLocation = function() {

	Operative.prototype.UpdateGraphicLocation.call(this);
	
	if (DEBUG_AI)
	{
		this.DebugAiGraphic.x = this.x;
		this.DebugAiGraphic.y = this.y;
	}
};
EnemyOperative.prototype.dispose = function() {
    this.OnTargetAcquired = null;
    Operative.prototype.dispose.call(this);
}

function EnemyStaticBoss (sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, player_ref, objectives, npc_ref){
	EnemyOperative.call(this, sprite_sheet, container_ref, mess_container_ref, non_walkable_regions, player_ref, objectives, npc_ref); 

	this.Health = 250;
};
EnemyStaticBoss.prototype = Object.create(EnemyOperative.prototype);
EnemyStaticBoss.prototype.constructor = EnemyStaticBoss;
EnemyStaticBoss.prototype.SetDestination = function() {
	return;
};
EnemyStaticBoss.prototype._CalculateRouteCallBack = function(msg) {
	
};

var Team = function() {
	this.Operatives = [];
	this.Destination = undefined;
	this.ChangeHandler = undefined;
	this.Empty = true;
	this.OperativeSpacing = 5;
};
Team.prototype = {
	Update: function() {
		for(var i = this.Operatives.length; i-- ;) {
			this.Operatives[i].Update();
		}
	},
	AttachOperative: function(op) {
		this.Operatives.push(op);
		this.Empty = false;
	},
	DetachOperative: function(index) {
		this.Operatives.splice(index, 1);
		this.Empty = this.Operatives.length == 0;
	},
	SetDestination: function(xy) {
		// based on team size, pick the formation we want our operatives to end up in
		for(var i = 0; i < this.Operatives.length; i++) {
			this.Operatives[i].SetDestination(this.GetOperativePositionInFormation(i, xy));
		}
	},
	Shoot: function(xy) {
		for(var i = 0; i < this.Operatives.length; i++) 
			if (!this.Operatives[i].IsDead())
				this.Operatives[i].Shoot(xy);
	},
	SetPosition: function(xy) {
		for(var i = 0; i < this.Operatives.length; i++) 
			if (!this.Operatives[i].IsDead())
				this.Operatives[i].SetPosition(this.GetOperativePositionInFormation(i, xy));
	},
	GetOperativePositionInFormation: function(operative, position) {
		switch(operative) {
			case 0:
				return [position[0] - this.OperativeSpacing, position[1] - this.OperativeSpacing];
				break;
			case 1:
				return [position[0] + this.OperativeSpacing, position[1] - this.OperativeSpacing]
				break;
			case 2:
				return [position[0] - this.OperativeSpacing, position[1] + this.OperativeSpacing]
				break;
			case 3:
				return [position[0] + this.OperativeSpacing, position[1] + this.OperativeSpacing]
				break;
			case 4: 
				return [position[0],  position[1]]
				break;
		};
	},
    dispose: function() {
        for(var i = this.Operatives.length; i--; )
            this.Operatives[i].dispose();

        this.Operatives = null;
    }
};

var Player = function() {
	this.Teams = [new Team()]; // add a default single team
	this.SelectedTeam = 0;
	this.MaxTeams = 4;
}
Player.prototype = { 
	AddTeam: function(team) {
		this.Teams.push(team);
	},
	SelectTeam: function(team) {
		this.SelectedTeam = team;
	},
	SetDestination: function(xy) {
		this.Teams[this.SelectedTeam].SetDestination(xy);
	},
	Shoot: function(xy) {
		createjs.SoundJS.play('gunshot');
		this.Teams[this.SelectedTeam].Shoot(xy);
	},
	AddOperativeToTeam: function(op, team) {
		this.Teams[team].AttachOperative(op);
		
		this.CleanUpTeams();
	},
	MoveOperativeToTeam: function(op, team) {
		var found_op = undefined;
		
		for (var i = 0; i < this.Teams.length; i++) {
			var found_index = -1;
			var j = 0;
			for (; j < this.Teams[i].Operatives.length; j++) {
				// is this our operative?
				if (this.Teams[i].Operatives[j] == op)
				{
					found_op = this.Teams[i].Operatives[j];
					break;
				}
			}
			if (found_op !== undefined) {
				// remove it from this array
				this.Teams[i].DetachOperative(j);
				break;
			}
		}
		
		if (found_op !== undefined)
		{
			// add it to the new team array..
			this.AddOperativeToTeam(found_op, team);
		}
		
		this.CleanUpTeams();
	},
	CleanUpTeams: function() {
		if (this.Teams.length > 1) {
			var found_empty = -1;
			do {
				for (var i = this.Teams.length - 1; i-- ;) // not the last team- that should always be empty
				{
					if (this.Teams[i].Operatives.length < 1)
						found_empty = i;
				}
				
				if (found_empty > 0) {
					this.Teams.splice(found_empty, 1);
					found_empty = -1;
				}
			} while (found_empty > 0);
		}
		
		// last team should always be empty
		if (this.Teams[this.Teams.length - 1].Operatives.length > 0 && this.Teams.length < this.MaxTeams)
			this.AddTeam(new Team());
	},
	Update: function() {
		for(var i = this.Teams.length; i--; )
			this.Teams[i].Update();
	},
    dispose: function() {
        for(var i = this.Teams.length; i--; )
            this.Teams[i].dispose();

        this.Teams = null;
    }
};

var RegionBuilder = function(container, stage, coords) {
	this.Data = [ 'id', [] ];
	this.RegionSoFar = new createjs.Shape();
	this.Line1 = new createjs.Shape();
	this.Line2 = new createjs.Shape();
	
	this.SetupShapeParameters(this.RegionSoFar);
	this.SetupShapeParameters(this.Line1);
	this.SetupShapeParameters(this.Line2);
	
	this.StageRef = stage;
	this.ContainerRef = container;
	
	this.ContainerRef.addChild(this.RegionSoFar);
	this.ContainerRef.addChild(this.Line1);
	this.ContainerRef.addChild(this.Line2);
	
	this.AddPoint(coords);
};
RegionBuilder.prototype = {
	AddPoint: function(coords) {
		this.Data[1].push([coords.x,coords.y]);
		this.RegionSoFar.graphics.lineTo(coords.x, coords.y);
	},
	FinishRegion: function() {
		this.ContainerRef.removeChild(this.RegionSoFar);
		this.ContainerRef.removeChild(this.Line1);
		this.ContainerRef.removeChild(this.Line2);
		
		this.Data[0] = RegionBuilder.NextId;
		
		RegionBuilder.NextId++;
		
		return this.Data;
	},
	UpdateShapePreview: function() {
		
		var last_point = this.Data[1][this.Data[1].length -1];
		var first_point = this.Data[1][0];
		
		var coords = this.StageRef.localToLocal(this.StageRef.mouseX,this.StageRef.mouseY, this.ContainerRef);
		var mouse = [coords.x, coords.y];
		
		this.Line1.graphics.clear();
		this.SetupShapeParameters(this.Line1);
		this.Line1.graphics.moveTo(last_point[0], last_point[1]);
		this.Line1.graphics.lineTo(mouse[0], mouse[1]);
		
		this.Line2.graphics.clear();
		this.SetupShapeParameters(this.Line2);
		this.Line2.graphics.moveTo(mouse[0], mouse[1]);
		this.Line2.graphics.lineTo(first_point[0], first_point[1]);
	},
	SetupShapeParameters: function(shape) {
		shape.graphics.setStrokeStyle(2, 'round', 'round');
		shape.graphics.beginStroke(createjs.Graphics.getRGB(0,0,0));
	}
};
RegionBuilder.NextId = 0;

var ScrollManager = function(container, stage, viewport_dimensions, total_area_dimensions, level_scale) { 
	this.StageReference = stage;
	this.Container = container;
	
	this.ViewportDimensions = viewport_dimensions;
	this.TotalAreaDimensions = total_area_dimensions;
	
	this.LevelScale = level_scale || 1;
	
	this.TotalAreaDimensions[0];
	this.TotalAreaDimensions[1];
	
	this.ScrollDestination = undefined;
	
	this.ScrollRegion = 200;
	this.MaxScrollSpeed = 10.0;
	
	this.OnScrollCallBack = undefined; // function(x, y)
};
ScrollManager.prototype = {
	Update: function() {
		
		if (this.ScrollDestination == undefined) {
			var x = this.StageReference.mouseX,
				y = this.StageReference.mouseY;
			
			var vector = this.GetScrollVector(x, y);
			
			this.Container.x += parseInt(this.MaxScrollSpeed * vector[CONST.Coordinates.x]);
			this.Container.y += parseInt(this.MaxScrollSpeed * vector[CONST.Coordinates.y]);
			
            this.ApplyBoundaryLimits(this.Container);
			
			if (this.OnScrollCallBack != undefined)
				this.OnScrollCallBack(this.Container.x, this.Container.y);
			
			return vector[CONST.Coordinates.x] !== 0 || vector[CONST.Coordinates.y] !== 0;
		}
		else {
			// TODO: Smooth scrolling logic...
		}
	},
    ApplyBoundaryLimits: function(o) {
        // final bounds check
		if (o.x > 0) o.x = 0;
		if (o.y > 0) o.y = 0;
		if (o.x < -(this.TotalAreaDimensions[0] - this.ViewportDimensions[0])) o.x = -(this.TotalAreaDimensions[0] - this.ViewportDimensions[0]);
		if (o.y < -(this.TotalAreaDimensions[1] - this.ViewportDimensions[1])) o.y = -(this.TotalAreaDimensions[1] - this.ViewportDimensions[1]);	
    },
	GetScrollVector: function(x, y) {
		var result = [0.0, 0.0];
		
		// x
		if (x < this.ScrollRegion && this.Container.x <= 0) // left
			result[CONST.Coordinates.x] = ((this.ScrollRegion - x) / this.ScrollRegion);
		else if (x > this.ViewportDimensions[0] - this.ScrollRegion && this.Container.x > -(this.TotalAreaDimensions[0] - this.ViewportDimensions[0])) // right
			result[CONST.Coordinates.x] = -(x - (this.ViewportDimensions[0] - this.ScrollRegion)) / this.ScrollRegion;
			
		// y
		if (y < this.ScrollRegion && this.Container.y <= 0) // top
			result[CONST.Coordinates.y] = ((this.ScrollRegion - y) / this.ScrollRegion);
		else if (y > this.ViewportDimensions[1] - this.ScrollRegion && this.Container.y > -(this.TotalAreaDimensions[1] - this.ViewportDimensions[1])) // bottom
			result[CONST.Coordinates.y] = -(y - (this.ViewportDimensions[1] - this.ScrollRegion)) / this.ScrollRegion;

		return result;
	},
	SmoothScrollToLocation: function(x, y) {
		this.ScrollDestination = [x, y];
	},
	CenterAtPoint: function(x, y) {

		x = -((x * this.LevelScale) - (this.ViewportDimensions[0] / 2 ) );

        y = -((y * this.LevelScale) - (this.ViewportDimensions[1] / 2 ) );

		
		this.Container.x = x;
		this.Container.y = y;

        this.ApplyBoundaryLimits(this.Container);
		
		if (this.OnScrollCallBack != undefined)
				this.OnScrollCallBack(this.Container.x, this.Container.y);
	},
    dispose: function() {
        this.StageReference = null;
        this.Container = null;
        this.OnScrollCallBack = null;
    }
};

var Clipper = function(img) {
	this.image = img;

	var canvas = document.createElement('canvas');
	canvas.id = "clipper-scratch";
	canvas.width = img.width;
	canvas.height = img.height;
	canvas.style.display = 'none';
	document.body.appendChild(canvas);

	this.canvas = document.getElementById('clipper-scratch'); 
	this.ctx = this.canvas.getContext('2d');
	
    img = null;
    canvas = null;
};
Clipper.prototype = {
	Clip: function(clipping_region, id) {

		var top = this.image.height, 
			left = this.image.width,
			bottom = 0,
			right = 0;
		
		this.ctx.save();   // Save the state, so we can undo the clipping 
		
		this.ctx.beginPath(); 
		
		this.ctx.moveTo(clipping_region[0][0], clipping_region[0][1]);
		
		// check the first point..
		if (clipping_region[0][0] < left)
			left = clipping_region[0][0];
		
		if (clipping_region[0][0] > right)
			right = clipping_region[0][0];
			
		if (clipping_region[0][1] < top)
			top = clipping_region[0][1];
			
		if (clipping_region[0][1] > bottom)
			bottom = clipping_region[0][1];	
		
		for(var i = 1; i < clipping_region.length; i++)
		{
			if (clipping_region[i][0] < left)
				left = clipping_region[i][0];
			
			if (clipping_region[i][0] > right)
				right = clipping_region[i][0];
				
			if (clipping_region[i][1] < top)
				top = clipping_region[i][1];
				
			if (clipping_region[i][1] > bottom)
				bottom = clipping_region[i][1];	
			
			this.ctx.lineTo(clipping_region[i][0],clipping_region[i][1]);
		}
		
		this.ctx.lineTo(clipping_region[0][0],clipping_region[0][1]);
		
		this.ctx.closePath();
		
		this.ctx.clip();   
		
		this.ctx.drawImage(this.image, 0, 0);  
		
		this.ctx.restore(); // Undo the clipping 
		
		// create a new canvas to store this in
		var target_canvas_tag = document.createElement('canvas');
		target_canvas_tag.id = id;
		document.body.appendChild(target_canvas_tag);
		target_canvas_tag.width = right - left;
		target_canvas_tag.height = bottom - top;
		target_canvas_tag.style.display = 'none';
		
		var target_canvas = document.getElementById(id); 
		var target_context = target_canvas.getContext('2d');
		
		// grab image using the bounding box we identified and stuff it into it's new container
		target_context.drawImage(this.canvas, left, top , right - left, bottom - top, 0, 0, right - left, bottom - top);
		//             drawImage(img,         sx,   sy,   swidth,       sheight,      x, y, width       , height)
		
		// clear the scratch canvas
		this.canvas.width = this.canvas.width;
		
		return { 
			canvas : target_canvas,
			top : top,
			right : right,
			bottom : bottom,
			left : left
		};

	},
	Dispose: function() {
		this.canvas.parentNode.removeChild(this.canvas);
		this.ctx = null;
		this.canvas = null;
	}
};

var DebugRegionRenderer = function(level_definition_reference, container_reference, stage_reference){
	this.OnScreenRegionGraphics = [];
	this.LevelDefinition = level_definition_reference;
	this.GraphicsContainer = container_reference;
	this.Stage = stage_reference;
	this.HighlightedArea = {type: undefined, index: undefined};
};
DebugRegionRenderer.prototype = {
	RefreshOnScreenRegions: function(draw_mode) {			
		for(var i = this.OnScreenRegionGraphics.length; i--; ) {
			this.GraphicsContainer.removeChild(this.OnScreenRegionGraphics[i]);
		}
		
		this.OnScreenRegionGraphics.length = 0;
		
		for (var e_type = this.LevelDefinition.length; e_type-- ; )
		{
			if (draw_mode == CONST.AreaType.All || draw_mode == e_type)
			{
				for(var j = this.LevelDefinition[e_type].length; j--; ) {
					if (e_type == CONST.AreaType.Entities)
					{
						this.DrawEntity(this.LevelDefinition[e_type][j]);
					}
					else 
					{
						var highlight = (e_type == this.HighlightedArea.type && j == this.HighlightedArea.index);
						this.DrawRegion(this.LevelDefinition[e_type][j], e_type, highlight);
					}
				}
			}			
		}
		
		this.Stage.update();
	},
	DrawRegion: function(area, areatype, highlight) {
		switch(areatype) {
			case CONST.AreaType.Blocked:
			case CONST.AreaType.ThreeD:
			case CONST.AreaType.Flammable:
				var s = new createjs.Shape();
				var g = s.graphics;
				g.setStrokeStyle(2, 'round', 'round');
				
				if (highlight) {
					g.beginFill(createjs.Graphics.getRGB(0,255,0, 0.5));
				}
				
				g.beginStroke(this.GetColourForAreaType(areatype));
				
				this.GraphicsContainer.addChild(s);
				this.OnScreenRegionGraphics.push(s);
				
				g.moveTo(area[1][0][CONST.Coordinates.x], area[1][0][CONST.Coordinates.y]);
				
				for(var i = 1; i < area[1].length; i++)
				{
					g.lineTo(area[1][i][CONST.Coordinates.x], area[1][i][CONST.Coordinates.y]);
				}
				
				g.lineTo(area[1][0][CONST.Coordinates.x], area[1][0][CONST.Coordinates.y]);
				break;
		}
		
		this.Stage.update();
	},
	DrawEntity: function(entity_definition) {
	
		var EntityIcon =  new createjs.Bitmap("icon-unknown.png");;
		
		switch(entity_definition.type) {
			case CONST.EntityType.PlayerStart:
				EntityIcon = new createjs.Bitmap("icon-start.png");
				break;
			case CONST.EntityType.Enemy:
				EntityIcon = new createjs.Bitmap("icon-enemy.png");
				break;
			case CONST.EntityType.Rescue:
				EntityIcon = new createjs.Bitmap("icon-rescue.png");
				break;
			case CONST.EntityType.Extraction:
				EntityIcon = new createjs.Bitmap("icon-exit.png");
				break;
            case CONST.EntityType.Assassinate:
				EntityIcon = new createjs.Bitmap("icon-assassinate.png");
				break;
		}

		EntityIcon.x = entity_definition.position[0];
		EntityIcon.y = entity_definition.position[1];
		this.OnScreenRegionGraphics.push(EntityIcon);
		this.GraphicsContainer.addChild(EntityIcon);
		
		this.Stage.update();
	},
	GetColourForAreaType: function(t) {
		switch(t) {
			case CONST.AreaType.Blocked:
				return createjs.Graphics.getRGB(0,0, 0);
			case CONST.AreaType.ThreeD:
				return createjs.Graphics.getRGB(255,255, 0);
			case CONST.AreaType.Flammable:
				return createjs.Graphics.getRGB(255,0, 0);
			case CONST.AreaType.Entities:
				return createjs.Graphics.getRGB(0, 0, 255);
		}
	},
};

var GameProp = function(bitmap, top, right, bottom, left, poly) {
	this.Bitmap = bitmap;
	this.Top = top;
	this.Right = right;
	this.Bottom = bottom;
	this.Left = left;
	this.Poly = poly;
};
GameProp.prototype = {
	isPointInPoly : function (pt){
		//+ Jonas Raoni Soares Silva
		//@ http://jsfromhell.com/math/is-point-in-poly [v1.0]
		for(var c = false, i = -1, l = this.Poly.length, j = l - 1; ++i < l; j = i)
			((this.Poly[i][CONST.Coordinates.y] <= pt.y && pt.y < this.Poly[j][CONST.Coordinates.y]) || (this.Poly[j][CONST.Coordinates.y] <= pt.y && pt.y < this.Poly[i][CONST.Coordinates.y]))
			&& (pt.x < (this.Poly[j][CONST.Coordinates.x] - this.Poly[i][CONST.Coordinates.x]) * (pt.y - this.Poly[i][CONST.Coordinates.y]) / (this.Poly[j][CONST.Coordinates.y] - this.Poly[i][CONST.Coordinates.y]) + this.Poly[i][CONST.Coordinates.x])
			&& (c = !c);
		return c;
	},
    dispose: function() {
        this.Bitmap = null;
    }
};

// Minimap doesn't require updating in the normal update cycle- it's event driven as and when a game entity moves or scrolls
/*
var MiniMap = function(blocked_regions, player_ref, npcs, level_base_dimensions, game_play_window_size, mini_map_size, mini_map_html_id, level_scale) {
	this.Regions = blocked_regions;
	this.PlayerRef = player_ref;
	this.NPCs = npcs;
	
	this.LevelBaseDimensions = level_base_dimensions;
	
	this.HorizontalScale = mini_map_size[0] / game_play_window_size[0];
	this.VerticleScale = mini_map_size[1] / game_play_window_size[1];
	
	this.HtmlID = mini_map_html_id;
	
	this.LevelScale = level_scale || 1;
	
	this.MiniMapDiv = document.getElementById(this.HtmlID);
	this.Divs = {};
	
	this.Initialised = false;
};
MiniMap.prototype = {
	Init: function() {
		for(var i = 0; i < this.PlayerRef.Teams.length; i++)
		{
			for(var j= 0; j < this.PlayerRef.Teams[i].Operatives.length; j++) 
			{
				var op = this.PlayerRef.Teams[i].Operatives[j];
				this.AddOperative(op);
			}
		}
		
		this.BuildMapImage();
		
		this.Initialised = true;
	},
	UpdateOffset: function(x, y) {
	
		x = (x * this.HorizontalScale);
		y = (y * this.VerticleScale);
		
		var x_diff = this.x_offset - x,
			y_diff = this.y_offset - y;
			
		this.x_offset = x;
		this.y_offset = y;
		this.MiniMapDiv.style.backgroundPosition = this.x_offset + 'px ' + this.y_offset + 'px';
		
		for(var i = 0; i < this.MiniMapDiv.children.length; i++){
			this.MiniMapDiv.children[i].style.marginTop = parseFloat(this.MiniMapDiv.children[i].style.marginTop.replace('px', '')) - y_diff + 'px';
			this.MiniMapDiv.children[i].style.marginLeft = parseFloat(this.MiniMapDiv.children[i].style.marginLeft.replace('px', '')) - x_diff + 'px';
		}
	},
	AddOperative: function(op, type) {
		var div = document.createElement('div');
		div.id = "op-marker-" + op.Name;
		div.setAttribute('class','person-marker');
		
		if (typeof(type) !== 'undefined')
		{
			if (type == CONST.EntityType.Rescue)	
			{
				div.setAttribute('class','person-marker rescue-marker');
			}
		}
		
		div.style.marginTop = Math.round(op.y * this.LevelScale * this.VerticleScale) + 'px';
		div.style.marginLeft = Math.round(op.x * this.LevelScale * this.HorizontalScale) + 'px';
		this.MiniMapDiv.appendChild(div);
		this.Divs[div.id] = div;
	},
	UpdateOperative: function(name, x, y){
		if (!this.Initialised) return;
		this.Divs["op-marker-" + name].style.marginTop = Math.round((y * this.LevelScale * this.VerticleScale) + this.y_offset) + 'px';
		this.Divs["op-marker-" + name].style.marginLeft = Math.round((x * this.LevelScale * this.HorizontalScale) + this.x_offset) + 'px';
	},
	BuildMapImage: function() {
		// create a new canvas to store this in
		var id = "minimap_scratch";
		var target_canvas_tag = document.createElement('canvas');
		target_canvas_tag.id = id;
		document.body.appendChild(target_canvas_tag);
		target_canvas_tag.width = this.LevelBaseDimensions[0];
		target_canvas_tag.height = this.LevelBaseDimensions[1];
		//target_canvas_tag.style.display = 'none';
		
		var target_canvas = document.getElementById(id); 
		var tctx = target_canvas.getContext('2d');
		
		tctx.fillStyle = "#fff";
		tctx.fillRect  (0,   0, this.LevelBaseDimensions[0],this.LevelBaseDimensions[1]);
		
		tctx.fillStyle = "#fefefe";
		tctx.strokeStyle = '#ccc'; // red
		tctx.lineWidth = 1;
		
		for(var i = 0; i < this.Regions.length; i++) {
			if (this.Regions[i][0] != -1) 
			{
				var r = this.Regions[i][1];
				
				
				tctx.beginPath();
				
				tctx.moveTo(r[0][0] * this.LevelScale * this.HorizontalScale, r[0][1] * this.LevelScale * this.VerticleScale);
				
				for (var j = 1; j < r.length; j++)
				{
					tctx.lineTo(r[j][0] * this.LevelScale * this.HorizontalScale, r[j][1] * this.LevelScale * this.VerticleScale);
				}
				
				tctx.lineTo(r[0][0] * this.LevelScale * this.HorizontalScale, r[0][1] * this.LevelScale * this.VerticleScale);
				tctx.fill();
				
				tctx.stroke();
				
				tctx.closePath();
			}
		}
		
		var map_data = target_canvas.toDataURL("image/png");
		
		this.MiniMapDiv.style.backgroundImage = 'url(' + map_data + ')';
		
		map_data = undefined;
		target_canvas.parentNode.removeChild(target_canvas);
	}
};
*/

var MiniMapCanvas = function(blocked_regions, player_ref, level_base_dimensions, game_play_window_size, mini_map_size, mini_map_html_id, level_scale) {
	this.Regions = blocked_regions;
	this.PlayerRef = player_ref;
	
	this.LevelBaseDimensions = level_base_dimensions;
	
	this.HorizontalScale = mini_map_size[0] / game_play_window_size[0];
	this.VerticleScale = mini_map_size[1] / game_play_window_size[1];
	
	var canvas = document.getElementById(mini_map_html_id);
	this.Stage = new createjs.Stage(canvas);
    canvas = null;
	this.Container = new createjs.Container();	
	this.Stage.addChild(this.Container);
	
	this.ObjectiveContainer = new createjs.Container();
	
	this.Markers = {};
	this.ObjectiveMarker = null;
	this.ObjectiveMarkerRad = 1;
	this.ObjectiveMarkerRadStep = 10;
	
	this.LevelScale = level_scale || 1;
		
	this.Initialised = false;
	
	this.dirty = false;
};
MiniMapCanvas.prototype = {
	Init: function() {
		
		this.BuildMapImage();
		
		this.Container.addChild(this.ObjectiveContainer);
		
		if (typeof(this.PlayerRef) !== 'undefined') {
			for(var i = 0; i < this.PlayerRef.Teams.length; i++)
			{
				for(var j= 0; j < this.PlayerRef.Teams[i].Operatives.length; j++) 
				{
					var op = this.PlayerRef.Teams[i].Operatives[j];
					this.AddOperative(op);
				}
			}
		}

		this.Initialised = true;
	},
	UpdateOffset: function(x, y) {
	
		x = (x * this.HorizontalScale);
		y = (y * this.VerticleScale);
		
		var x_diff = this.x_offset - x,
			y_diff = this.y_offset - y;
			
		this.x_offset = x;
		this.y_offset = y;
		this.Container.x = this.x_offset;
		this.Container.y = this.y_offset;
	},
	AddOperative: function(op, type) {
	
		if (typeof(this.Markers[op.Name]) !== 'undefined')
			return;
	
		var colour = createjs.Graphics.getRGB(0,255,0);
		
		switch(type) {
			
			case CONST.EntityType.Enemy: 
				colour = createjs.Graphics.getRGB(255,0,0);
				break;
			case CONST.EntityType.Rescue:
				colour = createjs.Graphics.getRGB(0,0,255);
				break;
		}

		var shape = 
			new createjs.Shape(
				new createjs.Graphics()
					.setStrokeStyle(1)
					.beginFill(colour)
					.drawCircle(0,0,1)
				);
				
		shape.x = Math.round(op.x * this.LevelScale * this.HorizontalScale);
		shape.y = Math.round(op.y * this.LevelScale * this.VerticleScale);

		this.Container.addChild(shape);
		
		this.Markers[op.Name] = shape;
		
	},
	UpdateOperative: function(name, x, y){
		if (!this.Initialised) return;
		this.Markers[name].y = Math.round((y * this.LevelScale * this.VerticleScale));
		this.Markers[name].x = Math.round((x * this.LevelScale * this.HorizontalScale));
	},
	SetDead: function(name) {
        if (this.Markers[name] === undefined)
            return;

		var shape = new createjs.Shape(
				new createjs.Graphics()
					.setStrokeStyle(1)
					.beginFill(createjs.Graphics.getRGB(0,0,0))
					.drawCircle(0,0,1)
				);
				
		shape.x = this.Markers[name].x;
		shape.y = this.Markers[name].y;
		this.Container.removeChild(this.Markers[name]);
		this.Container.addChild(shape);
	},
	BuildMapImage: function() {
		// create a new canvas to store this in
		var id = "minimap_scratch";
		var target_canvas_tag = document.createElement('canvas');
		target_canvas_tag.id = id;
		document.body.appendChild(target_canvas_tag);
		target_canvas_tag.width = this.LevelBaseDimensions[0];
		target_canvas_tag.height = this.LevelBaseDimensions[1];
		//target_canvas_tag.style.display = 'none';
		
		var target_canvas = document.getElementById(id); 
		var tctx = target_canvas.getContext('2d');
		
		tctx.fillStyle = "#fff";
		tctx.fillRect  (0,   0, this.LevelBaseDimensions[0],this.LevelBaseDimensions[1]);
		
		tctx.fillStyle = "#fefefe";
		tctx.strokeStyle = '#ccc'; // red
		tctx.lineWidth = 1;
		
		for(var i = 0; i < this.Regions.length; i++) {
			if (this.Regions[i][0] != -1) 
			{
				var r = this.Regions[i][1];
				
				
				tctx.beginPath();
				
				tctx.moveTo(r[0][0] * this.LevelScale * this.HorizontalScale, r[0][1] * this.LevelScale * this.VerticleScale);
				
				for (var j = 1; j < r.length; j++)
				{
					tctx.lineTo(r[j][0] * this.LevelScale * this.HorizontalScale, r[j][1] * this.LevelScale * this.VerticleScale);
				}
				
				tctx.lineTo(r[0][0] * this.LevelScale * this.HorizontalScale, r[0][1] * this.LevelScale * this.VerticleScale);
				tctx.fill();
				
				tctx.stroke();
				
				tctx.closePath();
			}
		}
				
		var map = new createjs.Bitmap(target_canvas_tag);
		this.Container.addChild(map);
		
		target_canvas_tag.parentNode.removeChild(target_canvas_tag);
	},
	SetObjectiveLocation: function(x, y) {
		this.ObjectiveY = Math.round((y * this.LevelScale * this.VerticleScale));
		this.ObjectiveX = Math.round((x * this.LevelScale * this.HorizontalScale));
		this.ObjectiveMarker = true;
	},
	AddExtraction: function(x,y,radius) {
		y = Math.round((y * this.LevelScale * this.VerticleScale));
		x = Math.round((x * this.LevelScale * this.HorizontalScale));
		var shape = new createjs.Shape(
				new createjs.Graphics()
					.setStrokeStyle(1)
					.beginStroke(createjs.Graphics.getRGB(255,0,0))
					.drawCircle(x,y,radius /2)
				);
		
		this.Container.addChild(shape);
	},
	Update: function() {
		if (this.ObjectiveMarker != null)
		{
			this.ObjectiveContainer.removeAllChildren();
			this.ObjectiveMarker = new createjs.Shape(
				new createjs.Graphics()
					.setStrokeStyle(1)
					.beginStroke(createjs.Graphics.getRGB(50,50,50))
					.drawCircle(this.ObjectiveX,this.ObjectiveY,this.ObjectiveMarkerRad)
				);
			this.ObjectiveContainer.addChild(this.ObjectiveMarker);
			this.ObjectiveMarkerRad += this.ObjectiveMarkerRadStep;
			
			// get distance from objective to operatives
			// if dist within the increment step, play the sound..
			var dist = this.PlayerRef.Teams[this.PlayerRef.SelectedTeam].Operatives[0].GetDistance({ x: this.ObjectiveX,y: this.ObjectiveY})
			if (this.ObjectiveMarkerRad >= dist - this.ObjectiveMarkerRadStep && this.ObjectiveMarkerRad <= dist + this.ObjectiveMarkerRadStep)
			{
				var ping = createjs.SoundJS.play('scan');
			}
			
			if (this.ObjectiveMarkerRad > 1000) {
				this.ObjectiveMarkerRad = 50;
			}
		}
		this.Stage.update();
	},
    dispose: function() {
        this.ObjectiveMarker = null;
        this.Stage = null;
        this.Markers = null;
    }
};