/*****************************************************************************
*
*  This file is part of the Turing-Drawings project. The project is
*  distributed at:
*  https://github.com/maximecb/Turing-Drawings
*
*  Copyright (c) 2012, Maxime Chevalier-Boisvert. All rights reserved.
*
*  This software is licensed under the following license (Modified BSD
*  License):
*
*  Redistribution and use in source and binary forms, with or without
*  modification, are permitted provided that the following conditions are
*  met:
*   1. Redistributions of source code must retain the above copyright
*      notice, this list of conditions and the following disclaimer.
*   2. Redistributions in binary form must reproduce the above copyright
*      notice, this list of conditions and the following disclaimer in the
*      documentation and/or other materials provided with the distribution.
*   3. The name of the author may not be used to endorse or promote
*      products derived from this software without specific prior written
*      permission.
*
*  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED
*  WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
*  MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN
*  NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
*  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
*  NOT LIMITED TO PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
*  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
*  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
*  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
*  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*
*****************************************************************************/

//============================================================================
// Page interface code
//============================================================================

var schedule =
    (   window.requestAnimationFrame
     || window.webkitRequestAnimationFrame
     || window.mozRequestAnimationFrame
     || function (callback) { setTimeout(callback, UPDATE_TIME); });

var running = false;

var progHist = new Array();
var hInd = 0;

/**
Called after page load to initialize needed resources
*/
function init()
{
    // Get a reference to the canvas
    canvas = document.getElementById("canvas");

    // Set the canvas size
    canvas.width = 512;
    canvas.height = 512;

    // Get a 2D context for the drawing canvas
    canvas.ctx = canvas.getContext("2d");

    // Create an image data array
    canvas.imgData = canvas.ctx.createImageData(canvas.width, canvas.height);

    // If a location hash is specified
    if (location.hash !== '')
    {
        console.log('parsing program');

        program = Program.fromString(
            location.hash.substr(1),
            canvas.width,
            canvas.height
        );
    }
    else
    {
        // Create a random program
        randomProg();
    }

    // Set the update function to be called regularly
    run();
}
window.addEventListener("load", init, false);

/**
Generate a new random program
*/
function randomProg()
{
    var numStates = parseInt(document.getElementById("numStates").value);
    var numSymbols = parseInt(document.getElementById("numSymbols").value);

    assert (
        numSymbols <= colorMap.length,
        colorMap.length + ' states currently supported'
    );

    console.log('num states: ' + numStates);
    console.log('num symbols: ' + numSymbols);

    program = new Program(numStates, numSymbols, canvas.width, canvas.height);

    // Set the sharing URL
    var str = program.toString();
    var url = location.protocol + '//' + location.host + location.pathname;
    var shareURL = url + '#' + str;
    document.getElementById("shareURL").value = shareURL;

    // Clear the current hash tag to avoid confusion
    location.hash = '';
	
	//add the program to program history
	hInd = progHist.length;
	progHist[hInd] = program.toString();
	hInd++;

    run();
}

function mutateProg() {
	hInd = progHist.length;
	progHist[hInd] = program.toString();
	hInd++;
	program.mutate();
	program = Program.fromString(
		program.toString(),
		canvas.width,
		canvas.height
	);
	run();
	
    // Set the sharing URL
    var str = program.toString();
    var url = location.protocol + '//' + location.host + location.pathname;
    var shareURL = url + '#' + str;
    document.getElementById("shareURL").value = shareURL;
}
function revert() {
	progHist.pop();
	if (hInd > 0) hInd--;
	program = Program.fromString(
		progHist[hInd-1],
		canvas.width,
		canvas.height
	);
	run();
	
    // Set the sharing URL
    var str = program.toString();
    var url = location.protocol + '//' + location.host + location.pathname;
    var shareURL = url + '#' + str;
    document.getElementById("shareURL").value = shareURL;
}
function forward() {
	if (hInd < progHist.length) hInd++;
	program = Program.fromString(
		progHist[hInd-1],
		canvas.width,
		canvas.height
	);
	
    // Set the sharing URL
    var str = program.toString();
    var url = location.protocol + '//' + location.host + location.pathname;
    var shareURL = url + '#' + str;
    document.getElementById("shareURL").value = shareURL;
}

function recombine() {
	var str1 = document.getElementById("parent1").value.split("#")[1].split(",");
	var str2 = document.getElementById("parent2").value.split("#")[1].split(",");
	var str3 = "";
	str3 += str1[0] > str2[0] ? str1[0] : str2[0];
	str3 += ",";
	str3 += str1[1] > str2[1] ? str1[1] : str2[1];
	str3 += ",";
	var ind = 2;
	for (ind; ind<str1.length && ind<str2.length; ind++) {
		if (Math.random()<.5) str3 += str1[ind];
		else str3 += str2[ind];
		if (ind<str1.length-1 && ind<str2.length-1) str3 += ",";
	}
	program = Program.fromString(
		str3,
		canvas.width,
		canvas.height
	);
	
    // Set the sharing URL
    var str = program.toString();
    var url = location.protocol + '//' + location.host + location.pathname;
    var shareURL = url + '#' + str;
    document.getElementById("shareURL").value = shareURL;
	run();
}

/**
Reset the program state
*/
function restartProg()
{
    program.reset();
    run();
}

function pauseOrPlay() {
    if (running) {
        running = false;
        document.getElementById("pause").innerHTML = "Play";
    }
    else
        run();
}

// Default console logging function implementation
if (!window.console) console = {};
console.log = console.log || function(){};
console.warn = console.warn || function(){};
console.error = console.error || function(){};
console.info = console.info || function(){};

//============================================================================
// Image update code
//============================================================================

/**
Map of symbols (numbers) to colors
*/
var colorMap = [
    255,0  ,0  ,    // Initial symbol color
    0  ,0  ,0  ,    // Black
    255,255,255,    // White
    0  ,255,0  ,    // Green
    0  ,0  ,255,    // Blue
    255,255,0  ,
    0  ,255,255,
    255,0  ,255,
];

/***
Time per update, in milliseconds
*/
var UPDATE_TIME = 20;

/**
Maximum iterations per update
*/
var speeds = [1, 3, 10, 33, 100, 333, 1000, 3333, 10000, 33333, 100000, 350000, 1000000, 3500000];
var speed = 10;
var UPDATE_ITRS = speeds[speed];

function bumpSpeed(offset) {
    speed = Math.max(0, Math.min(speed + offset, speeds.length-1));
    document.getElementById("slower").disabled = (speed === 0);
    document.getElementById("faster").disabled = (speed === speeds.length-1);

    UPDATE_ITRS = speeds[speed];
    run();
}

function run() {
    if (!running) schedule(updateRender);
    running = true;
    document.getElementById("pause").innerHTML = "Pause";
}

/**
Update the rendering
*/
function updateRender()
{
    var startTime = (new Date()).getTime();
    var startItrc = program.itrCount;

    // Until the update time is exhausted
    for (;;)
    {
        // Update the program
        program.update(Math.min(UPDATE_ITRS, 50000));

        var curTime = (new Date()).getTime();
        var curItrc = program.itrCount;

        if (curItrc - startItrc >= UPDATE_ITRS ||
            curTime - startTime >= UPDATE_TIME)
            break;
    }

    /*
    console.log(
        'x: ' + program.xPos + 
        ', y: ' + program.yPos + 
        ', st: ' + program.curState +
        ', cc: ' + program.itrCount
    );
    */

    // Produce the image data
    var data = canvas.imgData.data;
    var map = program.heap;
    var length = program.mapWidth * program.mapHeight;
    for (var i = 0; i < length; ++i)
    {
        var sy = map[i];

        var r = colorMap[3 * sy + 0];
        var g = colorMap[3 * sy + 1];
        var b = colorMap[3 * sy + 2];

        data[4 * i + 0] = r;
        data[4 * i + 1] = g;
        data[4 * i + 2] = b;
        data[4 * i + 3] = 255;
    }

    assert (
        length * 4 === data.length,
        'invalid image data length'
    );

    if (speeds[speed] <= 1000)
    {
        // Draw a ring around the Turing machine head.
        var cx = map[length+1];
        var cy = map[length+2];
        for (var j = -9; j <= 9; ++j)
        {
            for (var k = -9; k <= 9; ++k)
            {
                var r = j*j + k*k;
                if (13 < r && r < 77)
                {
                    var x = (cx + j) & (program.mapWidth - 1);
                    var y = (cy + k) & (program.mapHeight - 1);
                    var at = program.mapWidth * y + x;
                    // Show the ring's pixels by almost-reversing their colors.
                    data[4 * at + 0] ^= 255;
                    data[4 * at + 1] ^= 255;
                    data[4 * at + 2] ^= 63;
                }
            }
        }
    }

    // Show the image data
    canvas.ctx.putImageData(canvas.imgData, 0, 0);

    // Repeat
    if (running) schedule(updateRender);
}
