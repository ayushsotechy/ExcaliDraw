import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { io } from 'socket.io-client';
import { useParams } from 'react-router-dom';
import Konva from 'konva';
import Cursor from './Cursor';

//this is whiteboard component

// Initialize Socket
const socket = io('http://localhost:3001');

const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};


// --- GRID COMPONENT ---
const Grid = ({ stageScale, stagePos, width, height }: any) => {
    const GRID_SIZE = 50;
    const lines = [];

    const startX = Math.floor((-stagePos.x / stageScale) / GRID_SIZE) * GRID_SIZE;
    const endX = Math.floor(((-stagePos.x + width) / stageScale) / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor((-stagePos.y / stageScale) / GRID_SIZE) * GRID_SIZE;
    const endY = Math.floor(((-stagePos.y + height) / stageScale) / GRID_SIZE) * GRID_SIZE;

    for (let x = startX; x <= endX; x += GRID_SIZE) {
        lines.push(<Line key={`v-${x}`} points={[x, startY, x, endY]} stroke="#333" strokeWidth={1 / stageScale} opacity={0.3} />);
    }
    for (let y = startY; y <= endY; y += GRID_SIZE) {
        lines.push(<Line key={`h-${y}`} points={[startX, y, endX, y]} stroke="#333" strokeWidth={1 / stageScale} opacity={0.3} />);
    }

    return <Layer>{lines}</Layer>;
};

// --- MAIN COMPONENT ---
const Whiteboard: React.FC = () => {
  const { roomId } = useParams();
  const [lines, setLines] = useState<any[]>([]);
  const [cursors, setCursors] = useState<Record<string, any>>({});
  
  // Infinite Canvas State
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Tool State: 'pen', 'eraser', or 'move'
  const [tool, setTool] = useState<'pen' | 'eraser' | 'move'>('pen');
  const [color, setColor] = useState('#00D2FF');
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);

  const colors = [
    { name: 'Neon Blue', value: '#00D2FF' },
    { name: 'Neon Pink', value: '#F000FF' },
    { name: 'Neon Green', value: '#00FF94' },
    { name: 'White', value: '#FFFFFF' },
  ];

  useEffect(() => {
    if (roomId) socket.emit('join-room', roomId);
  }, [roomId]);

  useEffect(() => {
    socket.on('load-canvas', (savedLines) => setLines(savedLines));
    socket.on('draw-line', ({ prevPoint, currentPoint, color, strokeWidth }) => {
      setLines((prev) => [...prev, {
          tool: 'pen',
          points: [prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y],
          color,
          strokeWidth,
        }]);
    });
    socket.on('clear', () => setLines([]));
    socket.on('cursor-update', ({ userId, x, y, color }) => {
      setCursors((prev) => ({ ...prev, [userId]: { x, y, color } }));
    });
    return () => {
      socket.off('load-canvas');
      socket.off('draw-line');
      socket.off('clear');
      socket.off('cursor-update');
    };
  }, []);

  const emitCursorMove = useRef(
    throttle((x: number, y: number, roomId: string) => {
        socket.emit('cursor-move', { x, y, roomId });
    }, 30)
  ).current;

  const getRelativePointerPosition = (node: Konva.Node) => {
    const transform = node.getAbsoluteTransform().copy();
    transform.invert();
    const pos = node.getStage()?.getPointerPosition();
    return pos ? transform.point(pos) : null;
  };

  const handleMouseDown = (e: KonvaEventObject<any>) => {
    // 1. If we are in "move" mode, DO NOT DRAW. Let Konva handle the drag.
    if (tool === 'move') return;

    // 2. Only draw on left click
    if (e.evt.button !== 0) return;

    isDrawing.current = true;
    const pos = getRelativePointerPosition(e.target.getStage()!);
    if (!pos) return;

    setLines([...lines, { 
      tool, 
      points: [pos.x, pos.y], 
      color: tool === 'eraser' ? '#121212' : color,
      strokeWidth: tool === 'eraser' ? 20 : 5 
    }]);
  };

  const handleMouseMove = (e: KonvaEventObject<any>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pos = getRelativePointerPosition(stage);
    if (!pos || !roomId) return;
    
    emitCursorMove(pos.x, pos.y, roomId);

    // If moving mode or not drawing, stop here
    if (tool === 'move' || !isDrawing.current) return;

    let lastLine = lines[lines.length - 1];
    if (lastLine) {
        const prevX = lastLine.points[lastLine.points.length - 2];
        const prevY = lastLine.points[lastLine.points.length - 1];

        socket.emit('draw-line', {
            prevPoint: { x: prevX, y: prevY },
            currentPoint: { x: pos.x, y: pos.y },
            color: tool === 'eraser' ? '#121212' : color,
            strokeWidth: tool === 'eraser' ? 20 : 5,
            roomId
        });

        lastLine.points = lastLine.points.concat([pos.x, pos.y]);
        lines.splice(lines.length - 1, 1, lastLine);
        setLines(lines.concat());
    }
  };

  const handleMouseUp = () => {
    if (tool === 'move') return;
    isDrawing.current = false;
    const lastLine = lines[lines.length - 1];
    if (lastLine && roomId) {
      socket.emit('draw-end', { roomId, line: lastLine });
    }
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    if(!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if(!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleExport = () => {
    const uri = stageRef.current?.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = uri || '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`relative w-screen h-screen bg-[#121212] overflow-hidden ${tool === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}>
        {/* ROOM ID */}
        <div className="absolute top-5 left-5 z-50 text-gray-500 text-sm select-none pointer-events-none">
            Room: {roomId?.slice(0, 8)}... | Scale: {Math.round(stageScale * 100)}%
        </div>

      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        
        ref={stageRef}
        // KEY CHANGE: Only draggable if tool is 'move'
        draggable={tool === 'move'}
        onWheel={handleWheel}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onDragEnd={(e) => setStagePos(e.target.position())}
      >
        <Grid stageScale={stageScale} stagePos={stagePos} width={window.innerWidth} height={window.innerHeight} />
        <Layer>
  {lines.map((line, i) => (
    <Line
      key={i}
      points={line.points}
      stroke={line.color}
      strokeWidth={line.strokeWidth}
      tension={0.5}
      lineCap="round"
      lineJoin="round"
      
      /* --- ADD THIS PROP BELOW --- */
      globalCompositeOperation={
        line.tool === 'eraser' ? 'destination-out' : 'source-over'
      }
      /* --------------------------- */
    />
  ))}
          {Object.entries(cursors).map(([userId, cursor]) => (
            <Cursor key={userId} userId={userId.slice(0, 4)} x={cursor.x} y={cursor.y} color={userId.slice(0, 6)} />
          ))}
        </Layer>
      </Stage>

      {/* TOOLBAR */}
      <div className="absolute z-50 top-5 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm p-3 rounded-2xl border border-gray-700 shadow-2xl flex items-center gap-4">
        
        {/* Color Pickers (Switch to PEN automatically) */}
        <div className="flex gap-2 pr-4 border-r border-gray-700">
          {colors.map((c) => (
            <button
              key={c.name}
              onClick={() => { setTool('pen'); setColor(c.value); }}
              className={`w-8 h-8 rounded-full transition-all ${color === c.value && tool === 'pen' ? 'ring-2 ring-white scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>

        <div className="flex gap-2">
            {/* MOVE TOOL */}
            <button 
                onClick={() => setTool('move')} 
                className={`p-2 rounded-lg transition-all ${tool === 'move' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                title="Move Canvas"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-10l-4-4"/><path d="m15 2-2 2-2-2"/><path d="M15 2v11"/><path d="M9 2v11"/></svg>
            </button>

            {/* ERASER */}
            <button 
                onClick={() => setTool('eraser')} 
                className={`p-2 rounded-lg transition-all ${tool === 'eraser' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                title="Eraser"
            >
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            </button>

            {/* ACTIONS */}
            <button onClick={() => socket.emit('undo', roomId)} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-gray-400 hover:bg-gray-700 transition-all">Undo</button>
            <button onClick={() => { setLines([]); socket.emit('clear', roomId); }} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-red-400 hover:bg-red-900/30 transition-all">Clear</button>
            <button onClick={handleExport} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all">Save</button>
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 text-gray-600 text-xs pointer-events-none">
        {tool === 'move' ? 'Drag to Pan' : 'Click to Draw'} • Scroll to Zoom
      </div>
    </div>
  );
};

export default Whiteboard;