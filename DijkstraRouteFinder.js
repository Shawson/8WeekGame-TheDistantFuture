// TODO: Consider web workers to do the ai path finding in another thread?
// http://extremelysatisfactorytotalitarianism.com/blog/?p=932

self.onmessage = function (e) {

    switch (e.data.method) {
        case 'init':
            self.r = new DijkstraRouteFinder(e.data.allPolys);
            self.postMessage({ method: e.data.method, result: true });
            break;
        case 'shortestPath':
            var path = [];
            var solutionNodes = 0;
            var result = self.r.shortestPath(e.data.sx, e.data.sy, e.data.dx, e.data.dy, path, solutionNodes);
            self.postMessage({ method: e.data.method, path: path, solutionNodes: solutionNodes, result: result, targetXY: [e.data.dx, e.data.dy] });
    }

    e = null;
};


// implementation of Dijkstra's Algorithm - http://www.cs.sunysb.edu/~skiena/combinatorica/animations/dijkstra.html
// Original C code from http://alienryderflex.com/shortest_path/ - ported to javascript by Shaw Young (http://www.shawson.co.uk/codeblog/)
var DijkstraRouteFinder = function (allPolys) {
    this.allPolys = allPolys;
    allPolys = null;

    this.referencePointList = [];


    for (var polyI = 0; polyI < this.allPolys.length; polyI++) {
        for (var i = 0; i < this.allPolys[polyI][1].length; i++) {
            var p = new Point();
            p.x = this.allPolys[polyI][1][i][0];
            p.y = this.allPolys[polyI][1][i][1];
            this.referencePointList.push(p);
        }
    }
};
DijkstraRouteFinder.prototype = {
	//  Public-domain code by Darel Rex Finley, 2006.
	//  (This function automatically knows that enclosed polygons are "no-go" areas.)
	pointInPolygonSet: function(testX, testY) {

		var  oddNodes=false ;
		var   polyI, i, j ;

		for (polyI=0; polyI<this.allPolys.length; polyI++) 
		{
			for (i=0; i< this.allPolys[polyI][1].length; i++) 
			{
			
				j=i+1; 
				
				if (j==this.allPolys[polyI][1].length) j=0;
				
				var corner1 = this.allPolys[polyI][1][i],
					corner2 = this.allPolys[polyI][1][j];
				
				if   ( corner1[1]< testY
					&&     corner2[1]>=testY
					||     corner2[1]< testY
					&&     corner1[1]>=testY) 
				{
					if ( corner1[0]+(testY-corner1[1])
						/   (corner2[1]       -corner1[1])
						*   (corner2[0]       -corner1[0]) < testX) 
					{
						oddNodes=!oddNodes; 
					}
				}
			}
		}

		return oddNodes; 
	},

	//  This function should be called with the full set of *all* relevant polygons.
	//  (The algorithm automatically knows that enclosed polygons are “no-go”
	//  areas.)
	//
	//  Note:  As much as possible, this algorithm tries to return YES when the
	//         test line-segment is exactly on the border of the polygon, particularly
	//         if the test line-segment *is* a side of a polygon.
	lineInPolygonSet: function(testSX, testSY, testEX, testEY) {

		var  theCos, theSin, dist, sX, sY, eX, eY, rotSX, rotSY, rotEX, rotEY, crossX ;
		var     i, j, polyI ;

		testEX-=testSX;
		testEY-=testSY; 
		dist=Math.sqrt(testEX*testEX+testEY*testEY);
		theCos =testEX/ dist;
		theSin =testEY/ dist;

		for (polyI=0; polyI<this.allPolys.length; polyI++) 
		{
			for (i=0;    i< this.allPolys[polyI][1].length; i++) 
			{
			
				j=i+1; 
				
				if (j==this.allPolys[polyI][1].length) j=0;

				sX=this.allPolys[polyI][1][i][0]-testSX;
				sY=this.allPolys[polyI][1][i][1]-testSY;
				eX=this.allPolys[polyI][1][j][0]-testSX;
				eY=this.allPolys[polyI][1][j][1]-testSY;

				if (sX==0. && sY==0. && eX==testEX && eY==testEY
				||  eX==0. && eY==0. && sX==testEX && sY==testEY) 
				{
					return true; 
				}

				rotSX=sX*theCos+sY*theSin;
				rotSY=sY*theCos-sX*theSin;
				rotEX=eX*theCos+eY*theSin;
				rotEY=eY*theCos-eX*theSin;
				
				if (rotSY<0. && rotEY>0. ||  rotEY<0. && rotSY>0.) 
				{
					crossX=rotSX+(rotEX-rotSX)*(0.-rotSY)/(rotEY-rotSY);
					if (crossX>=0. && crossX<=dist) 
						return false; 
				}

				if ( rotSY==0.   && rotEY==0.
					&&  (rotSX>=0.   || rotEX>=0.  )
					&&  (rotSX<=dist || rotEX<=dist)
					&&  (rotSX< 0.   || rotEX< 0.
					||   rotSX> dist || rotEX> dist)) 
				{
					return false; 
				}
			}
		}

		return this.pointInPolygonSet(testSX+testEX/2.,testSY+testEY/2.); 
	},

	calcDist: function( sX,  sY,  eX,  eY) {
		eX-=sX; 
		eY-=sY; 
		return Math.sqrt(eX*eX+eY*eY); 
	},

	//  Finds the shortest path from sX,sY to eX,eY that stays within the polygon set.
	//
	//  Note:  To be safe, the solutionX and solutionY arrays should be large enough
	//         to accommodate all the corners of your polygon set (although it is
	//         unlikely that anywhere near that many elements will ever be needed).
	//
	//  Returns YES if the optimal solution was found, or NO if there is no solution.
	//  If a solution was found, solutionX and solutionY will contain the coordinates
	//  of the intermediate nodes of the path, in order.  (The startpoint and endpoint
	//  are assumed, and will not be included in the solution.)
	shortestPath: function( sX,  sY,  eX,  eY,  finalPath, solutionNodes) {

		var INF = 9999999.;     //  (larger than total solution dist could ever be)

		var pointList = [] ;   //  (enough for all polycorners plus two)
			
		var pointCount ;

		var treeCount, i, j, bestI, bestJ ;
		var bestDist, newDist ;

		//  Fail if either the startpoint or endpoint is outside the polygon set.
		// UPDATE- only fail if end point is outside the set
		if (/*!this.pointInPolygonSet(sX,sY) ||*/  !this.pointInPolygonSet(eX,eY)) 
		{
			return false; 
		}

		//  If there is a straight-line solution, return with it immediately.
		if (this.lineInPolygonSet(sX,sY,eX,eY)) {
			solutionNodes=0; 
			return true; 
		}

		//  Build a point list that refers to the corners of the
		//  polygons, as well as to the startpoint and endpoint.
		pointList.push(new Point());
		pointList[0].x=sX;
		pointList[0].y=sY; 
		
		pointList.push.apply(pointList, this.referencePointList); // copy over from our reference point list rather than rebuild every time
		
		pointCount = pointList.length;
		pointList.push(new Point());
		pointList[pointCount].x=eX;
		pointList[pointCount].y=eY; 
		pointCount++;

		//  Initialize the shortest-path tree to include just the startpoint.
		treeCount=1; 
		pointList[0].totalDist=0.;

		//  Iteratively grow the shortest-path tree until it reaches the endpoint
		//  -- or until it becomes unable to grow, in which case exit with failure.
		bestJ=0;
		while (bestJ<pointCount-1) 
		{
			bestDist=INF;
			for (i=0; i<treeCount; i++) 
			{
				for (j=treeCount; j<pointCount; j++) 
				{
					if (this.lineInPolygonSet( pointList[i].x,pointList[i].y, pointList[j].x,pointList[j].y)) 
					{
						newDist=pointList[i].totalDist + this.calcDist(pointList[i].x,pointList[i].y,pointList[j].x,pointList[j].y);
						if (newDist<bestDist) 
						{
							bestDist=newDist; 
							bestI=i; 
							bestJ=j; 
							//break; // DEBUG : speed up calc time by opting for the first path we find?
						}
					}
				}
				//if (bestDist<INF)  break;// DEBUG : speed up calc time by opting for the first path we find?
			}
			if (bestDist==INF) 
				return false;   //  (no solution)
				
			pointList[bestJ].prev = bestI;
			pointList[bestJ].totalDist = bestDist;
			
			var temp = pointList[bestJ];
			pointList[bestJ] = pointList[treeCount];
			pointList[treeCount] = temp;
			temp = undefined;
			
			treeCount++; 
		}

		//  Load the solution arrays.
		solutionNodes= -1; 
		i=treeCount-1;
		
		while (i> 0) {
			i = pointList[i].prev; 
			solutionNodes++; 
		}
		
		j=solutionNodes-1; 
		i=treeCount-1;
		
		while (j>=0) 
		{
			i = pointList[i].prev;
			finalPath[j] = [pointList[i].x, pointList[i].y];
			j--; 
		}

		return true;  //  Success.
	}
};

var Point = function() {
	this.x = 0;
	this.y = 0;
	this.totalDist = 0;
	this.prev = 0;
};