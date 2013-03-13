/**
 * Copyright (C) 2007-2013  Alex Schroeder <alex@gnu.org>
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * This code started out as a javascript rewriting of "text-mapper.pl" by Alex Schroeder.
 * NOTE : requires jQuery to load includes with AJAX HTTP GET.
 *
 * 2013-03-08 David Lacourt <david.lacourt@gmail.com>
 */
 
$.ajaxSetup({cache: false}); // or else includes won't be reloaded.

var TextMapper = TextMapper || {}; // JS namespace
TextMapper.dx = 100;
TextMapper.dy = 100 * Math.sqrt(3);


/*	The includes are powered by jQuery AJAX HTTP GET, which are asynchronous.
	In order to work, I had to rewrite the TextMapper.Mapper.process function so that it is also asynchronous.
	The result works, is a little slower, but with the added benefit of not blocking the UI during computing.
	(I used this : http://stackoverflow.com/a/7654602/526660 to transform a for loop into an asyncLoop)

USAGE :

asyncLoop({
    length : 5,
    functionToLoop : function(loop, i){
        setTimeout(function(){
            document.write('Iteration ' + i + ' <br>');
            loop();
        },1000);
    },
    callback : function(){
        document.write('All done!');
    }    
});
*/
var asyncLoop = function(o){
    var i=-1;

    var loop = function(){
        i++;
        if(i==o.length){o.callback(); return;}
        o.functionToLoop(loop, i);
    } 
    loop();//init
}


//----------------------------------------------------------------------------------------

TextMapper.Point = TextMapper.Point || (function(global) {

	var equals = function (otherPoint) {
		return ((this.x === otherPoint.x) && (this.y === otherPoint.y));
	};
	
	var coordinates = function () {
		return [this.x, this.y]; // simplified the "wantarray" usage as in JavaScript : ["a","b"]+"" => "a,b"
	};
	
	var pixels = function () {
		var _x = this.x * TextMapper.dx * 3/2;
		var _y = (this.y * TextMapper.dy) - (this.x%2 * TextMapper.dy/2);

		return [_x, _y]; // simplified the "wantarray" usage as in JavaScript : ["a","b"]+"" => "a,b"
	};	

/** 
 * Brute forcing the "next" step by trying all the neighbors. The
 * connection data to connect to neighbouring hexes.
 *
 * Example Map             Index for the array
 *
 *      0201                      2
 *  0102    0302               1     3
 *      0202    0402
 *  0103    0303               6     4
 *      0203    0403              5
 *  0104    0304
 *
 *  Note that the arithmetic changes when x is odd.
 */
	var oneStepTo = function(other) {
		var delta = [[[-1,  0], [ 0, -1], [+1,  0], [+1, +1], [ 0, +1], [-1, +1]],  // x is even
					[[-1, -1], [ 0, -1], [+1, -1], [+1,  0], [ 0, +1], [-1,  0]]]; // x is odd
		var min, best;
		for (var i = 0; i<=5; i++) {
			// make a new guess
			var _x = this.x + delta[this.x % 2][i][0];
			var _y = this.y + delta[this.x % 2][i][1];

			var d = (other.x - _x) * (other.x - _x) 
				  + (other.y - _y) * (other.y - _y);

			if (min === undefined || d < min) {
			  min = d;
			  best = newPoint(_x, _y);
			}
		}
		return best;
	};
	
	var partway = function(other /* a TextMapper.Point */, q /* a double value */) {
		var p1 = this.pixels();
		var p2 = other.pixels();

		q = (typeof q === 'undefined' || q === undefined || q === null) ? 1 : +q;

		return [(p1[0] + (p2[0] - p1[0]) * q), (p1[1] + (p2[1] - p1[1]) * q)];
	};
	
	var newPoint = function (_x,_y) {
		var x = +_x; // '+' forces conversion from anything to number
		var y = +_y; // '+' forces conversion from anything to number
		
		return {
			// objects
			x:x,
			y:y,
			
			// functions
			equals:equals,
			coordinates:coordinates,
			oneStepTo:oneStepTo,
			partway:partway,
			pixels:pixels,
			
			newPoint:newPoint
		};
	};
	
	return newPoint(0,0);
})(this); // anonymous auto executing function, passing this gives access to Window as the "global" function parameter inside the closure.

//----------------------------------------------------------------------------------------

TextMapper.Line = TextMapper.Line || (function(global) {

	var computeMissingPoints = function() {
		var i = 0;
		var current = this.points[i++];
		var result = [current];
		
		while (i < this.points.length) {
			current = current.oneStepTo(this.points[i]);
			result.push(current);
			if (current.equals(this.points[i])) {
				i++;
			}
		}

		return result;
	};

	/**
	 * generate SVG definitions for labels along lines.
	 * this one puts paths with id in the "defs" part of the svg.
	 */
	var svgInDefs = function() {
	  var path, current, next;
	  var _points = this.computeMissingPoints();
	  for (var i=0; i < _points.length-1; i++) {
		current = _points[i];
		next = _points[i+1];
		if (!path) {
		  // bézier curve A B A B
		  var a = current.partway(next, 0.3);
		  var b = current.partway(next, 0.5);
		  path = "M" + a + " C" + b + " " + a + " " + b;
		} else {
		  // continue curve
		  path += " S" + current.partway(next, 0.3)
			    + " " + current.partway(next, 0.5);
		}
	  }
	  // end with a little stub
	  path += " L" + current.partway(next, 0.7);

	  var attributes = this.map.pathAttributes[this.type];
	  var data = "<path id='" + this.id + "' d='"+path+"'/>\n";

	  return data;
	};
	
	/**
 	 * this one uses the paths with id previously put in the "defs" part of the svg.
	 */
	var svg = function(textAttributes, textPathAttributes) {
	  var path, current, next;
	  var _points = this.computeMissingPoints();
	  for (var i=0; i < _points.length-1; i++) {
		current = _points[i];
		next = _points[i+1];
		if (!path) {
		  // bézier curve A B A B
		  var a = current.partway(next, 0.3);
		  var b = current.partway(next, 0.5);
		  path = "M" + a + " C" + b + " " + a + " " + b;
		} else {
		  // continue curve
		  path += " S" + current.partway(next, 0.3)
			    + " " + current.partway(next, 0.5);
		}
	  }
	  // end with a little stub
	  path += " L" + current.partway(next, 0.7);

	  var attributes = this.map.pathAttributes[this.type];
	  var data = "<use xlink:href='#"+this.id+"' "+(attributes?attributes:'')+"/>\n"; // reference to path in definition
		if (this.label) {
			data += '<text '+(textAttributes?textAttributes:'')+'><textPath '+(textPathAttributes?textPathAttributes:'')+' xlink:href="#'+this.id+'">'+this.label+'</textPath></text>\n';
		}

	  return data;
	};
	
	// closure variable.
	var lastIdNb = 1;
	// generates a random id to use in the defs svg
	var randomId = function() {
		return 'line' + lastIdNb++;
	}
	
	var newLine = function(data) {
		var theNewLine = {
				//fields
				points:[/* of TextMapper.Points */],
				type:undefined,
				map:undefined,
				label:undefined,
				id:randomId(),
				
				// objects
				computeMissingPoints:computeMissingPoints,
				svg:svg,
				svgInDefs:svgInDefs,
				//debug:debug,
				//circle:circle,
				
				newLine:newLine
			};
	
		if (typeof data !== 'undefined' && typeof data === 'object' && Object.keys(data).length>0) {
			theNewLine.points = 'points' in data ? data.points : theNewLine.points;
			theNewLine.type = 'type' in data ? data.type : theNewLine.type;
			theNewLine.map = 'map' in data ? data.map : theNewLine.map;
			theNewLine.label = 'label' in data ? data.label : theNewLine.label;
			theNewLine.id = 'id' in data ? data.id : theNewLine.id;
		}

		return theNewLine;
	};

	return newLine();
})(this);

//----------------------------------------------------------------------------------------

TextMapper.Hex = TextMapper.Hex || (function(global) {

	var str = function() {
		return '(' + this.x + ',' + this.y + ')';
	};
	
	var svg = function() {
		var _x = +this.x;
		var _y = +this.y;
		var data = '';
		var x1, y1;
		for (var i = 0; i<this.type.length; i++) {
			var _type = this.type[i];
			x1 = _x * TextMapper.dx * 3/2;
			y1 = (_y * TextMapper.dy) - (_x%2 * TextMapper.dy/2);
			data += '  <use x="'+x1.toFixed(1)+'" y="'+y1.toFixed(1)+'" xlink:href="#'+_type+'" />\n';
		}
		
		if (this.map && this.map.showPositionLabels) {
			x1 = _x * TextMapper.dx * 3/2;
			y1 = ((_y * TextMapper.dy) - (_x%2 * TextMapper.dy/2)) - (TextMapper.dy * 0.4);
		
			var x2 = ('00'.substring(0, 2 - (''+_x.toFixed(0)).length) + _x.toFixed(0)); // ... a little more complicated than sprintf with %02d
			var y2 = ('00'.substring(0, 2 - (''+_y.toFixed(0)).length) + _y.toFixed(0)); 
		
			data += '  <text text-anchor="middle" x="'+x1.toFixed(1)+'" y="'+y1.toFixed(1)+'" ' + (this.map.textAttributes?this.map.textAttributes:'') + '>\n'
					+ x2 + '.' + y2
					+ '\n</text>\n';
		}
				
		return data;
	};
	
	var svgLabel = function() {
		if (!this.label) return '';
		var data = '';
		var x1 = this.x * TextMapper.dx * 3/2;
		var y1 = ((this.y * TextMapper.dy) - (this.x%2 * TextMapper.dy/2)) + (TextMapper.dy * 0.4);

		data = '  <text text-anchor="middle" x="'+x1.toFixed(1)+'" y="'+y1.toFixed(1)+'" ' + (this.map.labelAttributes?this.map.labelAttributes:'') + ' '+ (this.map.glowAttributes?this.map.glowAttributes:'') + '>\n'
		   + this.label
		   + '\n</text>\n';
		   
		data += '  <text text-anchor="middle" x="'+x1.toFixed(1)+'" y="'+y1.toFixed(1)+'" '+ (this.map.labelAttributes?this.map.labelAttributes:'') +'>\n'
		   + this.label
		   + '\n</text>\n';

		return data;
	};

	var newHex = function(data) {
		var theNewHex = {
				// fields
				x:undefined,
				y:undefined,
				label:undefined,
				type:undefined,
				map:undefined,
				
				// functions
				str:str,
				svg:svg,
				svgLabel:svgLabel,
				
				newHex:newHex
			};
		if (typeof data !== 'undefined' && typeof data === 'object' && Object.keys(data).length>0) {
			theNewHex.x = 'x' in data ? +data.x : theNewHex.x;
			theNewHex.y = 'y' in data ? +data.y : theNewHex.y;
			theNewHex.label = 'label' in data ? data.label : theNewHex.label;
			theNewHex.type = 'type' in data ? data.type : theNewHex.type;
			theNewHex.map = 'map' in data ? data.map : theNewHex.map;
		}
		return theNewHex;
	};
	return newHex();
})(this);

//----------------------------------------------------------------------------------------

TextMapper.Mapper = TextMapper.Mapper || (function(global) {
	var initialize = function(aMap, initCallback) {
		this.map = aMap;
		var mapSplittedByLineBreaks = this.map.split(/\r?\n+\s*/);
		var that = this; // capture `this` in async closure below
		
		asyncLoop({
			length : mapSplittedByLineBreaks.length,
			functionToLoop : function(loop, i){
				setTimeout(function(){
					that.process(mapSplittedByLineBreaks[i], loop);
				},0);
			},
			callback : function(){
				// Mapper asynchronous loop initialization done
				initCallback();
			}
		});
	};

	var process = function(arg, next /*an asynchronous callback*/) {
		if (/^\s*position_labels\s*=\s*no\s*/.test(arg)) {
			// use `position_labels=no` to disable XX.YY labels on every hexes.
			
			this.showPositionLabels = false;
			next();
		} else if (/^[Ff](\d\d)(\d\d)-(\d\d)(\d\d)\s+?([^"\r\n]+)\s*/.test(arg)) {
			// `F0101-3345	plain` fill the zone with plain hexes
			
			var groups = /^[Ff](\d\d)(\d\d)-(\d\d)(\d\d)\s+?([^"\r\n]+)\s*/.exec(arg);
			var xStart = +groups[1];
			var yStart = +groups[2];
			var xEnd = +groups[3];
			var yEnd = +groups[4];
			
			for (var xx = xStart; xx <= xEnd; xx++) {
				for (var yy = yStart; yy <= yEnd; yy++) {
					var hex = TextMapper.Hex.newHex({
						x: xx, 
						y: yy, 
						map: this, 
						label: undefined,
						type: groups[5].trim().split(/\s+/)/* this create a new array for each hex*/}
					);
					this.addOrReplaceHex(hex);
				}
			}
			
			next();
		} else if (/^[Rr]((?:\d\d\d\d(?:-\d\d\d\d)*(?:-\d\d)?\s?)+)\s+?([^"\r\n]+)?\s*(?:"(.+)")?/.test(arg)) {
			// `R0101-0102-0103	mountain	"Everest Range"`
			// `R0101-03 terrainType	"region label"` ca be used in place of `R0101-0102-0103 terrainType	"region label"`
			
			var groups = /^[Rr]((?:\d\d\d\d(?:-\d\d\d\d)*(?:-\d\d)?\s?)+)\s+?([^"\r\n]+)?\s*(?:"(.+)")?/.exec(arg);
			var hexfills = groups[1].trim().split(/\s+/);// allows more than one value, separated by some space or tab..
			
			for (var k=0; k<hexfills.length; k++) {
				var hexfill = hexfills[k];
				var hexfillGroups = /^(\d\d\d\d(?:-\d\d\d\d)*)(-\d\d)?$/.exec(hexfill);
				var maybeExtendedHex;
				
				if (/-/.test(hexfillGroups[1])) {
					// first we need to split the independant values. Each one is an hex. Last one might be followed by a range extension.
					hexCoordGroups = /-/.exec(hexfillGroups[1]);
					for (var g=0;g<hexCoordGroups.length;g++) {
						var hex = TextMapper.Hex.newHex({
							x: hexCoordGroups[g].substring(0,2), 
							y: hexCoordGroups[g].substring(2,4), 
							map: this, 
							label: groups[3],
							type: groups[2].trim().split(/\s+/)}
						);
						this.addOrReplaceHex(hex);
						maybeExtendedHex = hex;
					}
				} else {
					var hex = TextMapper.Hex.newHex({
						x: hexfillGroups[1].substring(0,2), 
						y: hexfillGroups[1].substring(2,4), 
						map: this, 
						label: groups[3],
						type: groups[2].trim().split(/\s+/)}
					);
					this.addOrReplaceHex(hex);
					maybeExtendedHex = hex;
				}
				
				if (hexfillGroups[2]) {
					var lastHexYCoords = +hexfillGroups[2].substring(1,3);
					// only Y can be a range. Sorry about that.
					// note: +1 to init value because maybeExtendedHex has already been added.
					for (var yy=maybeExtendedHex.y+1; yy <= lastHexYCoords; yy++) {
						var hex = TextMapper.Hex.newHex({
							x: maybeExtendedHex.x,
							y: yy,
							map: this, 
							label: groups[3],
							type: groups[2].trim().split(/\s+/)}
						);
						this.addOrReplaceHex(hex);
					}
				}
			}
			next();
			
		} else if (/^M(\d\d)(\d\d)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.test(arg)) {
			// `M0506 ruins_NW "lz01"`
			var groups = /^M(\d\d)(\d\d)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.exec(arg);
		
			var _types = groups[3].trim().split(/\s+/);
			var hex = TextMapper.Hex.newHex({
				x: groups[1], 
				y: groups[2], 
				map: this, 
				label: groups[4]?groups[4].trim():groups[4],
				type: _types}
			);
	  
			this.mergeHex(hex);
			next();
			
		} else if (/^(\d\d)(\d\d)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.test(arg)) {
			// `0101	mountain	"The Everest"`
			
			var groups = /^(\d\d)(\d\d)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.exec(arg);
		
			var _types = groups[3].trim().split(/\s+/);
			var hex = TextMapper.Hex.newHex({
				x: groups[1], 
				y: groups[2], 
				map: this, 
				label: groups[4]?groups[4].trim():groups[4],
				type: _types}
			);
	  
			this.addOrReplaceHex(hex);
			next();
		} else if (/^(\d\d\d\d(?:-\d\d\d\d)+)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.test(arg)) {
			// `0101-0102-0202	road	"some optional label to write along the road"`
			
			var groups = /^(\d\d\d\d(?:-\d\d\d\d)+)\s+([^"\r\n]+)?\s*(?:"(.+)")?/.exec(arg);
			var textPath = groups[3];
			
			var _points = [];
			var pointsStr = groups[1].split('-');
			for (var i = 0; i<pointsStr.length; i++) {
				var st = pointsStr[i];
				_points.push(TextMapper.Point.newPoint(st.substring(0, 2),st.substring(2, 4)));
			}

			var $line = TextMapper.Line.newLine({map:this, type: groups[2].trim(), points:_points, label:textPath});

			this.lines.push($line);
			next();
		} else if (/^(\S+)\s+attributes\s+(.*)/.test(arg)) {
			//`mountain		attributes	blah=stuff`
			
			var groups = /^(\S+)\s+attributes\s+(.*)/.exec(arg);
			this.attributes[groups[1]] = groups[2];
			next();
		} else if (/^(\S+)\s+path\s+attributes\s+(.*)/.test(arg)) {
			//`mountain	path	attributes	blah=stuff`
			
			var groups = /^(\S+)\s+path\s+attributes\s+(.*)/.exec(arg);
			this.pathAttributes[groups[1]] = groups[2];
			next();
		} else if (/^(\S+)\s+path\s+textAttributes\s+(.*)/.test(arg)) {
			//`mountain	path	textAttributes	blah=stuff`
			
			var groups = /^(\S+)\s+path\s+textAttributes\s+(.*)/.exec(arg);
			this.pathTextAttributes[groups[1]] = groups[2];
			next();
		} else if (/^(\S+)\s+path\s+textPathAttributes\s+(.*)/.test(arg)) {
			//`mountain	path	textPathAttributes	blah=stuff`
			
			var groups = /^(\S+)\s+path\s+textPathAttributes\s+(.*)/.exec(arg);
			this.pathTextPathAttributes[groups[1]] = groups[2];
			next();
		} else if (/^(\S+)\s+path\s+(.*)/.test(arg)) {
			//`road	path	blah=foo`
			
			var groups = /^(\S+)\s+path\s+(.*)/.exec(arg)
			this.path[groups[1]] = groups[2];
			next();
		} else if (/^text\s+(.*)/.test(arg)) {
			//`text blah=bar`
			
			var groups = /^text\s+(.*)/.exec(arg)
			this.textAttributes = groups[1];
			next();
		} else if (/^glow\s+(.*)/.test(arg)) {
			//`glow blah=bar`
			
			var groups = /^glow\s+(.*)/.exec(arg)
			this.glowAttributes = groups[1];
			next();
		} else if (/^label\s+(.*)/.test(arg)) {
			//`label	blah=bar`
			
			var groups = /^label\s+(.*)/.exec(arg)
			this.labelAttributes = groups[1];
			next();
		} else if (/^include\s+(\S*)/.test(arg)) {
			//`include	some_url`
			
			var groups = /^include\s+(\S*)/.exec(arg)

			if (Object.keys(this.seen).length > 5) {
				this.messages.push("Includes are limited to five to prevent loops");
				next();
			} else if (this.seen[groups[1]]) {
				this.messages.push(groups[1] + " was included twice");
				next();
			} else {
				var urlToGET = groups[1];
				this.seen[urlToGET] = 1;
				
				var that = this; // capture this in async closure below
				$.get(urlToGET).done(function(data, status) {
					if (status == 'success') {
						var includeDataSplittedByLineBreaks = data.split(/\r?\n+\s*/);
						asyncLoop({
							length : includeDataSplittedByLineBreaks.length,
							functionToLoop : function(subloop, j){
								setTimeout(function(){
									that.process(includeDataSplittedByLineBreaks[j], subloop);
								},0);
							},
							callback : function(){
								if ('console' in global && global.console && global.console.info) global.console.info('Include asynchronous loop processing done !');
								next(); // back to the main async loop ...
							}    
						});
					} else {
						that.messages.push(status);
						next();
					}
				}).fail(function(jqxhr, textStatus, errorThrown) {
					if ('console' in global && global.console && global.console.error) global.console.error ("AJAX GET Failed for " + urlToGET + "; " + textStatus + " ; " + errorThrown);
					that.messages.push("Failed to include " + urlToGET);
					next();
				});
			}
		} else {
			// for comments or empty lines or other unknown malformed lines
			
			//if ('console' in global && global.console && global.console.info) global.console.info('ignored line : \n'+arg+'');
			next();
		}
	};

	var add = function(hex) {
		this.hexes.push(hex);
	};
	
	var addOrReplaceHex = function(hex) {
		// add a type to an existing hex if it exists, or else add the new hex.
		var foundExistingHexAtSamePos = undefined;
		for (var i=0; i<this.hexes.length; i++) {
			var existingHex = this.hexes[i];
			if (existingHex.x === hex.x && existingHex.y === hex.y) {
				foundExistingHexAtSamePos = existingHex;
				break;
			}
		}
		if (foundExistingHexAtSamePos) {
			// will replace types for previously defined hex.
			foundExistingHexAtSamePos.type = hex.type;
			// will replace label for previously defined hex.
			foundExistingHexAtSamePos.label = hex.label;
		} else {
			// simply add the hex.
			this.hexes.push(hex);
		}
	}

	var mergeHex = function(hex) {
		// add a type to an existing hex if it exists, or else add the new hex.
		var foundExistingHexAtSamePos = undefined;
		for (var i=0; i<this.hexes.length; i++) {
			var existingHex = this.hexes[i];
			if (existingHex.x === hex.x && existingHex.y === hex.y) {
				foundExistingHexAtSamePos = existingHex;
				break;
			}
		}
		if (foundExistingHexAtSamePos) {
			for (var i=0; i<hex.type.length; i++) {
				// TODO remove duplicates ?
				foundExistingHexAtSamePos.type.push(hex.type[i]);
			}
			foundExistingHexAtSamePos.label = (foundExistingHexAtSamePos.label ? foundExistingHexAtSamePos.label : "") 
				+ (hex.label && foundExistingHexAtSamePos.label ? ", " : "")
				+ (hex.label ? hex.label : "");
		} else {
			this.hexes.push(hex);
		}
	};

	var svg = function() {
		var minx, miny, maxx, maxy;
		var hex;
		for (var i = 0; i < this.hexes.length; i++) { 
			var hex = this.hexes[i];
			minx = minx === undefined ? hex.x : minx > hex.x ? hex.x : minx;
			maxx = maxx === undefined ? hex.x : maxx < hex.x ? hex.x : maxx;
			miny = miny === undefined ? hex.y : miny > hex.y ? hex.y : miny;
			maxy = maxy === undefined ? hex.y : maxy < hex.y ? hex.y : maxy;
		}

		var vx1 = Math.round((minx * TextMapper.dx * (3/2)) - TextMapper.dx - 10);
		var vy1 = Math.round((miny - 1) * TextMapper.dy - 10);
		var vx2 = Math.round((maxx * TextMapper.dx * (3/2)) + TextMapper.dx + 10);
		var vy2 = Math.round((maxy + 0.5) * TextMapper.dy + 10) + 10;

		var width = vx2 - vx1;
		var height = vy2 - vy1;

		var _boardmap = []; // bigass array reverse-referencing everything ! 
		// For the moment only used to reference hexes that are stacked at the same coordinates.
		
		for (var yy=0; yy<=maxy; yy++) {
			_boardmap.push([]);
			for (var xx=0; xx<=maxx; xx++) {
				_boardmap[yy].push({/*pos:{x:xx,y:yy},*/ hexes:[]/*, lines:[], labels:[], markings:[]*/});
			}
		}

		var doc = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
			+'<svg xmlns="http://www.w3.org/2000/svg" version="1.1"\n'
			+'     viewBox="' + vx1+ ' '+ vy1 + ' '+vx2+' '+vy2+'"\n'
			+'     xmlns:xlink="http://www.w3.org/1999/xlink">\n'
			+'  <!-- ('+minx+', '+miny+') ('+maxx+', '+maxy+') -->\n'
			+'  <defs>\n';

		// collect hex types from attributess and paths in case the sets don't overlap
		var type = {};

		for (var $type in this.attributes) {if (this.attributes.hasOwnProperty($type)) {
			type[$type] = 1;
		}}
		for (var $type in this.path) {if (this.path.hasOwnProperty($type)) {
			type[$type] = 1;
		}}

		// now go through them all
		for (var $type in type) {if (type.hasOwnProperty($type)) {
			var $attributes = this.attributes[$type];
			var $path = this.path[$type];
			var $glowAttributes = this.glowAttributes;
			var $pathAttributes = this.pathAttributes[$type];
			var x1= -TextMapper.dx; 
			var y1= 0; 
			var x2= -TextMapper.dx/2; 
			var y2= TextMapper.dy/2; 
			var x3= TextMapper.dx/2; 
			var y3= TextMapper.dy/2;
			var x4= TextMapper.dx; 
			var y4= 0;
			var x5= TextMapper.dx/2;
			var y5= -TextMapper.dy/2; 
			var x6= -TextMapper.dx/2; 
			var y6= -TextMapper.dy/2;
	  
			if ($path && $attributes) {
				// hex with shapes, eg. plains and grass
				doc += '\n'
					+'    <g id=\''+$type+'\'>\n'
					+'      <polygon '+($attributes?$attributes:'')+' points=\''+x1+','+y1+' '+x2+','+y2+' '+x3+','+y3+' '+x4+','+y4+' '+x5+','+y5+' '+x6+','+y6+'\' />\n'
					+'      <path '+($pathAttributes?$pathAttributes:'')+' d=\''+$path+'\' />\n'
					+'    </g>\n';
    		} else if ($path) {
    			// just shapes, eg. a house
				doc += "\n<g id='"+$type+"'>\n"
						+ ($glowAttributes?
							("  <path "+($glowAttributes?$glowAttributes:'')+" d='"+$path+"' />\n")
							:"")
						+"  <path "+($pathAttributes?$pathAttributes:'')+" d='"+$path+"' />\n"
						+"</g>\n";
			} else {
				// just a hex
				doc += '\n'
					+"    <polygon id='"+$type+"' "+($attributes?$attributes:'')+" points='"+x1+","+y1+" "+x2+","+y2+" "+x3+","+y3+" "+x4+","+y4+" "+x5+","+y5+" "+x6+","+y6+"' />\n";
			}
		}}
		// other stuffs to put in //svg/defs ? for example, line path definitions
		for (var i = 0; i < this.lines.length; i++) {
			var line = this.lines[i];
			doc += line.svgInDefs();
		}
		doc += '\n  </defs>\n';

		for (var i = 0; i < this.hexes.length; i++) {
			var hex = this.hexes[i];
			// fill boardmap with hexes stacks.
			_boardmap[hex.y][hex.x].hexes.push(hex);
		}

		for (var i = 0; i < this.hexes.length; i++) {
			var hex = this.hexes[i];
			var topHex = _boardmap[hex.y][hex.x].hexes[_boardmap[hex.y][hex.x].hexes.length-1];
			if (topHex === hex) { // NOTE : to enable hex stacking, comment these and leave only the following line
				doc += hex.svg();
			//} else {
			//	if ('console' in global && global.console && global.console.info) global.console.info ('ignored an hex because there is another over it at the same coordinates');
			}
		}
		for (var i = 0; i < this.lines.length; i++) {
			var line = this.lines[i];
			doc += line.svg(this.pathTextAttributes[line.type], this.pathTextPathAttributes[line.type]);
		}
		for (var i = 0; i < this.hexes.length; i++) {
			var hex = this.hexes[i];
			doc += hex.svgLabel();
		}
		for (var i = 0; i < this.messages.length; i++) {
			var msg = this.messages[i];
			doc += "  <text x='0' y='"+((i+1)*10)+"'>"+msg+"</text>\n";
		}

		doc += "<!-- Source\n" + this.map + "\n-->\n";
		doc += '\n</svg>\n';

		return doc;
	};
	
	var newMapper = function(data) {
		var theNewMapper = {
				// fields
				hexes:[/* of TextMapper.Hex */],
				attributes: {},
				map: undefined,
				path: {},
				lines: [/* of TextMapper.Line */],
				pathAttributes: {},
				pathTextAttributes: {},
				pathTextPathAttributes: {},
				textAttributes: undefined,
				glowAttributes: undefined,
				labelAttributes: undefined,
				messages: [/* of string */],
				seen: {},
				showPositionLabels: true,
				
				// functions
				initialize:initialize,
				process:process,
				add:add,
				addOrReplaceHex:addOrReplaceHex,
				mergeHex:mergeHex,
				svg:svg,
				newMapper:newMapper
			};
	
		if (typeof data !== 'undefined' && typeof data === 'object' && Object.keys(data).length>0) {
			theNewMapper.hexes = 'hexes' in data ? data.hexes : theNewMapper.hexes;
			theNewMapper.attributes = 'attributes' in data ? data.attributes : theNewMapper.attributes;
			theNewMapper.map = 'map' in data ? data.map : theNewMapper.map;
			theNewMapper.path = 'path' in data ? data.path : theNewMapper.path;
			theNewMapper.lines = 'lines' in data ? data.lines : theNewMapper.lines;
			theNewMapper.pathAttributes = 'pathAttributes' in data ? data.pathAttributes : theNewMapper.pathAttributes;
			theNewMapper.textAttributes = 'textAttributes' in data ? data.textAttributes : theNewMapper.textAttributes;
			theNewMapper.glowAttributes = 'glowAttributes' in data ? data.glowAttributes : theNewMapper.glowAttributes;
			theNewMapper.labelAttributes = 'labelAttributes' in data ? data.labelAttributes : theNewMapper.labelAttributes;
			theNewMapper.messages = 'messages' in data ? data.messages : theNewMapper.messages;
			theNewMapper.type = 'type' in data ? data.type : theNewMapper.type;
			theNewMapper.showPositionLabels = 'showPositionLabels' in data ? data.showPositionLabels : theNewMapper.showPositionLabels;
		}
	
		return theNewMapper;
	};
	return newMapper();
})(this);
