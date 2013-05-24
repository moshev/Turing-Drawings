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

var ACTION_LEFT  = 0;
var ACTION_RIGHT = 1;
var ACTION_UP    = 2;
var ACTION_DOWN  = 3;
var ACTION_STAY  = 4;
var NUM_ACTIONS  = 4;

/*
N states, one start state
K symbols
4 actions (left, right up, down)

N x K -> N x K x A
*/
function Program(numStates, numSymbols, mapWidth, mapHeight)
{
    assert (
        numStates >= 1,
        'must have at least 1 state'
    );
    
    assert (
        numSymbols >= 2,
        'must have at least 2 symbols'
    );

    /// Number of states and symbols
    this.numStates = numStates;
    this.numSymbols = numSymbols;

    /// Image dimensions
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    /// Transition table
    this.table = new Int32Array(numStates * numSymbols * 3);

    /// Machine state:
    ///   2D tape in the first mapWidth*mapHeight cells; then
    ///   state, xPos, yPos
    /// (size is * 2 instead of + 3 to keep it a power of 2 as asm.js requires)
    this.heap = new Int8Array(mapWidth * mapHeight * 2); 
    assert((mapWidth & (mapWidth-1)) === 0, "must be a power of 2");
    assert((mapHeight & (mapHeight-1)) === 0, "must be a power of 2");

    // Generate random transitions
    for (var st = 0; st < numStates; ++st)
    {
        for (var sy = 0; sy < numSymbols; ++sy)
        {
            this.setTrans(
                st,
                sy,
                randomInt(0, numStates - 1),
                randomInt(0, numSymbols - 1),
                randomInt(0, NUM_ACTIONS - 1)
            );
        }
    }

    // Initialize the state
    this.reset();
}

Program.prototype.setTrans = function (st0, sy0, st1, sy1, ac1)
{
    var idx = (this.numStates * sy0 + st0) * 3;

    this.table[idx + 0] = st1;
    this.table[idx + 1] = sy1;
    this.table[idx + 2] = ac1;
}

Program.prototype.getTrans = function (st0, sy0)
{
    var idx = (this.numStates * sy0 + st0) * 3;
    return {state:  this.table[idx+0],
            symbol: this.table[idx+1],
            act:    this.table[idx+2]};
}

Program.prototype.reset = function ()
{
    /// Iteration count
    this.itrCount = 0;

    // Initialize the image, state, and location
    for (var i = 0; i < this.heap.length; ++i)
        this.heap[i] = 0;
    var after = this.mapWidth*this.mapHeight;
    this.heap[after+1] = this.mapWidth/2;  // x position
    this.heap[after+2] = this.mapHeight/2; // y position
    this.heap[after+3] = 1; // movement left
    this.heap[after+4] = 1; // movement down
}

Program.prototype.toString = function ()
{
    var str = this.numStates + ',' + this.numSymbols;

    for (var i = 0; i < this.table.length; ++i)
        str += ',' + this.table[i];

    return str;
}

Program.fromString = function (str, mapWidth, mapHeight)
{
    console.log(str);

    var nums = str.split(',').map(Number);

    numStates  = nums[0];
    numSymbols = nums[1];

    console.log('num states: ' + numStates);
    console.log('num symbols: ' + numSymbols);

    assert (
        numStates > 0 &&
        numSymbols > 0,
        'invalid input string'
    );

	assert(
		numStates < 256 && numSymbols < 7,
		'too many states or symbols'
	);

    var prog = new Program(numStates, numSymbols, mapWidth, mapHeight);

    assert (
        prog.table.length === nums.length - 2,
        'invalid transition table length'
    );

    for (var i = 0; i < prog.table.length; ++i)
        prog.table[i] = nums[i+2];

    return prog;
}

Program.prototype.update = function (numItrs)
{
    // N.B. If you ever mutate this.table, mapWidth, mapHeight, then
    // also delete this.update so it'll get regenerated here.
    try {
        this.reallyUpdate = makemachine(window, null, this.heap.buffer);
        this.update = function(numItrs) {
            this.reallyUpdate(this.mapWidth, this.mapHeight,
					this.numStates, this.numSymbols, numItrs);
            this.itrCount += numItrs;
        };
        this.update(numItrs);
    } catch (e) {
        this.update = function(){};
        throw e;
    }
}

function perfectLog2(n) {
    var result = log2(n);
    assert(result === (result|0), "must be a power of 2");
    return result;
}

function log2(n) {
    return Math.log(n) / Math.log(2);
}

var makemachine = function(stdlib, foreign, heap) {
	"use asm";
	var dLeft = 1|0;
	var dDown = 1|0;
	var xPos = 0|0;
	var yPos = 0|0;
	var heap8 = new stdlib.Int8Array(heap);
	// dx, dy in a flat array
	var actions = new stdlib.Int32Array(NUM_ACTIONS * 2);
	actions[ACTION_LEFT + 0] = -1;
	actions[ACTION_LEFT + 1] = 0;
	actions[ACTION_RIGHT + 2] = 1;
	actions[ACTION_RIGHT + 3] = 0;
	actions[ACTION_UP + 4] = 0
	actions[ACTION_UP + 5] = -1;
	actions[ACTION_DOWN + 6] = 0;
	actions[ACTION_DOWN + 7] = 1;
	function move_bounce(dx, dy, w, h) {
		w = w|0;
		h = h|0;
		dx = dx|0;
		dy = dy|0;
		xPos += dx * dLeft;
		yPos += dy * dDown;
		if (xPos >= w || xPos < 0) {
			dLeft = -dLeft;
			xPos += 2 * dx * dLeft;
		}
		if (yPos >= h || yPos < 0) {
			dDown = -dDown;
			yPos += 2 * dy * yPos;
		}
	}
	function move_teleport(dx, dy, w, h) {
		w = w|0;
		h = h|0;
		dx = dx|0;
		dy = dy|0;
		xPos += dx * dLeft;
		yPos += dy * dDown;
		if (xPos >= w || xPos < 0) {
			xPos -= dx * w;
		}
		if (yPos >= h || yPos < 0) {
			yPos -= dy * h;
		}
	}
	var move = move_teleport;
	function writeint32(offset, i) {
		offset = offset|0;
		i = i|0;
		heap8[offset] = (i >> 24) & 0xFF;
		heap8[offset + 1] = (i >> 16) & 0xFF;
		heap8[offset + 2] = (i >> 8) & 0xFF;
		heap8[offset + 3] = i & 0xFF;
	}
	function readint32(offset) {
		return ((heap8[offset] << 24) |
				(heap8[offset + 1] << 16) |
				(heap8[offset + 2] << 8) |
				heap8[offset + 3])|0;
	}
	function ilog2(n) {
		n = n|0;
		n = (n - 1)|0;
		n = n | (n >> 1);
		n = n | (n >> 2);
		n = n | (n >> 4);
		n = n | (n >> 8);
		n = n | (n >> 16);
		n = (n + 1)|0;
		n = n >> 1;
		return n|0;
	}
	function update(w, h, nst, nsy, niter) {
		w = w|0;
		h = h|0;
		nst = nst|0;
		nsy = nsy|0;
		niter = niter|0;
		var after = (w * h)|0;
		var state = 0;
		var log2w = 0;
		var log2nsy = 0;
		var symbol = 0;
		state = readint32(after);
        xPos = readint32(after + 4);
        yPos = readint32(after + 8);
        dLeft = readint32(after + 12);
        dDown = readint32(after + 16);
        for (i = niter; 0 < (i|0); i = (i - 1)|0) {
            oldPos = (yPos * w + xPos)|0;
			symbol = heap8[oldPos]|0;
			
		}
		writeint32(after, state);
        writeint32(after + 4, xPos);
        writeint32(after + 8, yPos);
        writeint32(after + 12, dLeft);
        writeint32(after + 16, dDown);
	}
	return update;
}

function asmgenerate(program)
{
	return null;
    var mapWidth  = program.mapWidth;
    var mapHeight = program.mapHeight;
    var numStates = program.numStates;
    var table     = program.table;
    var after = mapWidth * mapHeight;
    var logMapWidth = perfectLog2(mapWidth);
    var logNumSymbols = Math.ceil(log2(program.numSymbols));
    // replace '\0' with - or +
    // bounce
    var xMovetemplate1 = "            xPos = (xPos \0 dLeft)|0; if ((xPos|0) >= "+mapWidth+" || (xPos|0) < 0) { dLeft = (-dLeft)|0; xPos = (xPos \0 dLeft \0 dLeft)|0; }\n";
    var yMovetemplate1 = "            yPos = (yPos \0 dDown)|0; if ((yPos|0) >= "+mapHeight+" || (yPos|0) < 0) { dDown = (-dDown)|0; yPos = (yPos \0 dDown \0 dDown)|0; }\n";
    // teleport
    var xMovetemplate2 = "            xPos = (xPos \0 dLeft)|0; if ((xPos|0) >= "+mapWidth+" || (xPos|0) < 0) { xPos = (xPos - (\0 "+mapWidth+"))|0; }\n";
    var yMovetemplate2 = "            yPos = (yPos \0 dDown)|0; if ((yPos|0) >= "+mapHeight+" || (yPos|0) < 0) { yPos = (yPos - (\0 "+mapHeight+"))|0; }\n";
    // roll
    var xMovetemplate3 =
        "            xPos = (xPos \0 dLeft)|0;\n"+
        "            if ((xPos|0) >= "+mapWidth+") {\n"+
        "                xPos = ("+mapWidth+" - 1)|0;\n"+
        "                rollX(1);\n"+
        "            } else if ((xPos|0) < 0) {\n"+
        "                xPos = 0;\n"+
        "                rollX(-1);\n"+
        "            }\n";
    var yMovetemplate3 =
        "            yPos = (yPos \0 dDown)|0;\n"+
        "            if ((yPos|0) >= "+mapHeight+") {\n"+
        "                yPos = ("+mapHeight+" - 1)|0;\n"+
        "                rollY(1);\n"+
        "            } else if ((yPos|0) < 0) {\n"+
        "                yPos = 0;\n"+
        "                rollY(-1);\n"+
        "            }\n";
    var xMovetemplate4 = 
        "            xPos = (xPos \0 dLeft)|0;\n"+
        "            if ((xPos|0) >= "+mapWidth+") {\n"+
        "                xPos = ("+mapWidth+" - 1)|0;\n"+
        "            } else if ((xPos|0) < 0) {\n"+
        "                xPos = 0;\n"+
        "            }\n";
    var yMovetemplate4 =
        "            yPos = (yPos \0 dDown)|0;\n"+
        "            if ((yPos|0) >= "+mapHeight+") {\n"+
        "                yPos = ("+mapHeight+" - 1)|0;\n"+
        "            } else if ((yPos|0) < 0) {\n"+
        "                yPos = 0;\n"+
        "            }\n";
    var xMovetemplate5 = 
        "            xPos = (xPos \0 dLeft)|0;\n"+
        "            if ((xPos|0) >= "+mapWidth+" || (xPos|0) < 0) {\n"+
        "                xPos = "+mapWidth/2+";\n"+
        "            }\n";
    var yMovetemplate5 =
        "            yPos = (yPos \0 dDown)|0;\n"+
        "            if ((yPos|0) >= "+mapHeight+" || (yPos|0) < 0) {\n"+
        "                yPos = "+mapHeight/2+";\n"+
        "            }\n";


    var xMovetemplate = xMovetemplate2;
    var yMovetemplate = yMovetemplate2;
    var xMovetemplate = xMovetemplate1;
    var yMovetemplate = yMovetemplate1;

    var code = "";
    code += "function goober(stdlib, foreign, heap) {\n";
    code += '"use asm";\n';
    code += "var heap32 = new stdlib.Int32Array(heap);\n";
    code += "    function rollX(dx) {\n";
    code += "        dx = (+dx)|0;\n";
    code += "        var di = dx > 0 ? 1:-1;\n";
    code += "        var i = 0, j = 0, start = 0, a = 0, b = 0;\n";
    code += "        for (j = 0; j < "+mapHeight+"; j++) {\n";
    code += "            start = (j << "+logMapWidth+")|0;\n";
    code += "            for (i = (dx > 0 ? 0 : ("+mapWidth+" - 1)|0); (dx > 0 ? ((i|0) < "+mapWidth+"-dx) : ((i|0) >= -dx)); i = (i+di)|0) {\n";
    code += "                a = ((start + i) << 2)|0;\n";
    code += "                b = ((start + i + dx) << 2)|0;\n";
    code += "                heap32[a >> 2] = heap32[b >> 2];\n";
    code += "            }\n";
    code += "            for (i = (dx > 0 ? ("+mapWidth+" - dx)|0 : 0); i < (dx > 0 ? "+mapWidth+": -dx); i++) {\n";
    code += "                a = ((start + i) << 2)|0;\n";
    code += "                heap32[a >> 2] = 0;\n";
    code += "            }\n";
    code += "        }\n";
    code += "    }\n";
    code += "    function rollY(dy) {\n";
    code += "        dy = (+dy)|0;\n";
    code += "        var i = 0, j = 0, to = 0, from = 0;\n";
    code += "        var dj = (dy > 0 ? 1:-1)|0;\n";
    code += "        for (j = (dy > 0 ? 0 : ("+mapWidth+" - 1)|0); (dy > 0 ? ((j|0) < "+mapHeight+"):((j|0) >= -dy)); j = (j+dj)|0) {\n";
    code += "            to = (j * "+mapWidth+")|0;\n";
    code += "            from = (to + dy * "+mapWidth+")|0;\n";
    code += "            for (i = 0; i < "+mapWidth+"; i++) {\n";
    code += "                heap32[(to + i)|0] = heap32[(from + i)|0];\n";
    code += "            }\n";
    code += "        }\n";
    code += "        for (j = (dy > 0 ? ("+mapHeight+" - dy)|0 : 0); j < (dy > 0 ? "+mapHeight+" : -dy); j++) {\n";
    code += "            to = (j * "+mapWidth+")|0;\n";
    code += "            for (i = 0; i < "+mapWidth+"; i++) {\n";
    code += "                heap32[(to + i)|0] = 0;\n";
    code += "            }\n";
    code += "        }\n";
    code += "    }\n";
    code += "function update(numItrs) {\n";
    code += "    numItrs = numItrs|0;\n";
    code += "    var state = 0;\n";
    code += "    var xPos  = 0;\n";
    code += "    var yPos  = 0;\n";
    code += "    var i     = 0;\n";
    code += "    var oldPos = 0;\n";

    code += "    state = heap32["+((after+0)<<2)+">>2]|0;\n";
    code += "    xPos  = heap32["+((after+1)<<2)+">>2]|0;\n";
    code += "    yPos  = heap32["+((after+2)<<2)+">>2]|0;\n";
    code += "    dLeft = heap32["+((after+3)<<2)+">>2]|0;\n";
    code += "    dDown = heap32["+((after+4)<<2)+">>2]|0;\n";

    code += "    for (i = numItrs; 0 < (i|0); i = (i - 1)|0) {\n";
    code += "        oldPos = (((yPos<<"+logMapWidth+") + xPos)<<2)|0;\n";
    code += "        switch (((heap32[oldPos>>2]|0) + (state<<"+logNumSymbols+"))|0) {\n";
    for (var state = 0; state < numStates; ++state)
    {
        for (var symbol = 0; symbol < program.numSymbols; ++symbol)
        {   
            var next = program.getTrans(state, symbol);
            code += "        case "+(symbol + (state << logNumSymbols))+":\n";
            if (next.state !== state)
                code += "            state = "+next.state+";\n";
            if (next.symbol !== symbol)
                code += "            heap32[oldPos>>2] = "+next.symbol+";\n";
            switch (next.act)
            {
            case ACTION_STAY:
                break;
            case ACTION_LEFT:
                code += xMovetemplate.replace(/\0/g, '-');
                break;
            case ACTION_RIGHT:
                code += xMovetemplate.replace(/\0/g, '+');
                break;
            case ACTION_UP:
                code += yMovetemplate.replace(/\0/g, '-');
                break;
            case ACTION_DOWN:
                code += yMovetemplate.replace(/\0/g, '+');
                break;
            default:
                error('invalid action');
            }
            code += "            break;\n";
        }
    }
    code += "        }\n";
    code += "    }\n";
    code += "    heap32["+((after+0)<<2)+">>2] = state;\n";
    code += "    heap32["+((after+1)<<2)+">>2] = xPos;\n";
    code += "    heap32["+((after+2)<<2)+">>2] = yPos;\n";
    code += "    heap32["+((after+3)<<2)+">>2] = dLeft;\n";
    code += "    heap32["+((after+4)<<2)+">>2] = dDown;\n";
    code += "}\n";
    code += "return update;\n";
    code += "}\n";
    return code;
}
