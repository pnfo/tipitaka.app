function getRand(items) {
    var ind = Math.floor(Math.random() * items.length); 
    return items[ind];
}
function getRange(start, end) {
    return start + Math.random() * (end - start);
}
var colors = ['green', 'gold', 'orange', 'red', 'yellowgreen', 'navy', 'brown', 'goldenrod', 'darksalmon', 'orangered']
var strokeColors = ['black', 'red', 'white'];

var oCirWidth = view.center.x * getRange(0.07, 0.12);
var strokeWidth = getRange(0.5, 1.5);
var strokeColor = getRand(strokeColors);
var fillColor = getRand(colors);
var wr = (view.center.x - oCirWidth/2 - strokeWidth * 2);


var oCir1 = new Path.Circle(view.center, wr + oCirWidth/2);
oCir1.strokeColor = strokeColor;
oCir1.strokeWidth = strokeWidth*2;
var oCir2 = new Path.Circle(view.center, wr - oCirWidth/2);
oCir2.style = oCir1.style;
//oCir.fillColor = 'white';

var garadiRatios = [ getRange(0.2, 0.35), getRange(0.45, 0.8) ];
var garadi = new Path();
garadi.add(view.center);
for (i = 0; i < garadiRatios.length; i++)
    garadi.add(view.center + [ -10, -wr * garadiRatios[i] ]);
garadi.add(view.center + [ 0, -wr ]);
for (i = garadiRatios.length - 1; i >= 0; i--)
    garadi.add(view.center + [ 10, -wr * garadiRatios[i] ]);
garadi.closePath();
garadi.fillColor = fillColor;
garadi.strokeColor = strokeColor;
garadi.strokeWidth = strokeWidth;
if (Math.random() < 0.5) garadi.smooth();
var symbol = new Symbol(garadi);
for (var i = 23; i >= 0; i--) {
    var placed = symbol.place(view.center + [ 0, -wr/2 ]);
    placed.rotate(360/24 * i, view.center);
}

//var oCirColor = fillColor;
//var poly = new Path.RegularPolygon(view.center, 24, wr - 10);
//poly.strokeColor = oCirColor;
//poly.strokeWidth = 10;


var gCirRad = view.center.x * getRange(0.03, 0.05);
var gCirPos = getRange(-10, 5);
var gCir = new Path.Circle(view.center, gCirRad);
gCir.fillColor = fillColor;
gCir.strokeColor = strokeColor;
gCir.strokeWidth = strokeWidth;
var symbol = new Symbol(gCir);
for (var i = 0; i < 24; i ++) {
    var placed = symbol.place(new Point(view.center.x, oCirWidth + gCirRad + gCirPos));
    placed.rotate(360/24 * (i + 0.5), view.center);
}


var oCir = new Path.Circle(view.center, wr);
//oCir.fillColor = oCirColor;
oCir.strokeColor = fillColor;
oCir.strokeWidth = oCirWidth;

var mCir = new Path.Circle(view.center, view.center.x * getRange(0.1, 0.2));
mCir.strokeColor = strokeColor;
mCir.strokeWidth = getRange(1, 10);
mCir.fillColor = fillColor;
console.log(view.center);

