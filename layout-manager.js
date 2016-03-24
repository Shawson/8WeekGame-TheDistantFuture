// Layout Manager Class
// Ported By Shaw Young 2010.04.25 
// From original C# source code by Shaw Young 2008 developed for http://www.shawson.co.uk/ShawsonAndCo/Gallery.htm

//oo javascript ; http://devedge-temp.mozilla.org/viewsource/2001/oop-javascript/
function DefinedArea(x, y, width, height)
{
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
}

function ByRefParam()  //used for passing out paramaters from javascript - http://www.codeproject.com/KB/scripting/parameters.aspx
{
    this.array = new Array(1);

    this.setValue = function(v) { this.array[0] = v; }
    this.getValue = function()  { return this.array[0]; }
}

function LayoutManager(w, h)
{
    this.max_width = w;
    this.max_height = h;

    _taken_areas = new Array();

    //constructor
    if (typeof (_layoutmanager_prototype_called) == 'undefined') {
        _layoutmanager_prototype_called = true;
        LayoutManager.prototype.findFreeSpace = findFreeSpace;
        LayoutManager.prototype.forcePosition = forcePosition;
        LayoutManager.prototype.isTaken = isTaken;
        LayoutManager.prototype.consumeSpace = consumeSpace;
    }

    function findFreeSpace(width, height)
    {
        //look at the area, row by row horizontally
        for (y = 0; y < this.max_height; y++)
        {
            y_increment = height;

            for (x = 0; x < this.max_width; x++)
            {
                x_increment = width;

                //check we've not exceeded the boundaries
                if (x + width < this.max_width && y + height < this.max_height)
                {
                    taken_area_value = new ByRefParam();

                    //is this a free spot?
                    if (isTaken(x, y, width, height, taken_area_value))
                    {
                        taken_area = taken_area_value.getValue();

                        //nope it's taken- adjust the increments to the smallest picture we encounter on this column/row
                        //this takes into account if the shape was placed half way through the taken shape (if this is the case
                        // you only want to increments forward fo rthe remainder of the shape!
                        if (y_increment > ((taken_area.y + taken_area.height) - y)) {y_increment = ((taken_area.y + taken_area.height) - y);}
                        if (x_increment > ((taken_area.x + taken_area.width) - x)) { x_increment = ((taken_area.x + taken_area.width) - x);}

                    }
                    else
                    {
                        //it's free, take the space!
                        consumeSpace(x, y, width, height);
                        return new DefinedArea(x, y, width, height);
                        break;
                    }
                    x += x_increment;
                }
            }
            y += y_increment;
        }

        return new DefinedArea(0, 0, 0, 0);
    }

    function forcePosition(x, y, width, height)
    {
        consumeSpace(x, y, width, height);
		return new DefinedArea(x, y, width, height);
    }

    function isTaken(x, y, width, height, taken_area) //taken_area should be of type ByRefParam - returns bool
    {
        for (i = 0; i < _taken_areas.length; i++)
        {
            area = _taken_areas[i];

            // see if we are colliding with any other already used areas...
            if (
                // X AXIS
                //            area x totally engulfs target          OR                       area overlaps target from the left                      OR                       overlaps from the right                       OR                                totally covering
                  ((area.x <= x && area.x + area.width >= x + width) || (area.x <= x && area.x + area.width <= x + width && area.x + area.width >= x) || (area.x >= x && area.x <= x + width && area.x + width >= x + width) || (area.x >= x && area.x <= x + width && area.x + area.width <= x + width)) &&
                // Y AXIS
                //          area y values totally engulf target        OR                        area overlaps target from the top                         OR                       area y values overlap from the bottom            OR                    area y values  totally within target area
                  ((area.y <= y && area.y + area.height >= y + height) || (area.y <= y && area.y + area.height <= y + height && area.y + area.height >= y) || (area.y >= y && area.y <= y + height && area.y + height >= y + height) || (area.y >= y && area.y <= y + height && area.y + area.height <= y + height))
                )
            {
                taken_area.setValue(area);  // pass back value via the out param
                return true;
            }
        }
        return false;
    }
    
    function consumeSpace(x, y, width, height) {
        _taken_areas[_taken_areas.length] = new DefinedArea(x, y, width, height);
    }
}