import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text as KonvaText, Transformer } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { io } from 'socket.io-client';
import { useParams } from 'react-router-dom';
import Konva from 'konva';
import Cursor from './Cursor'; 

// --- ICONS ---
const Icons = {
  Select: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>,
  Pen: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  Eraser: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z"/><path d="M17 17L7 7"/></svg>,
  Hand: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>,
  Rect: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>,
  Circle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>,
  Text: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
};

const socket = io('http://localhost:3001');
const generateId = () => Math.random().toString(36).substr(2, 9);

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

const Whiteboard: React.FC = () => {
  const { roomId } = useParams();
  
  const [elements, setElements] = useState<any[]>([]);
  const [cursors, setCursors] = useState<Record<string, any>>({});
  
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const [tool, setTool] = useState<'select' | 'pen' | 'eraser' | 'move' | 'rect' | 'circle' | 'text'>('pen');
  const [color, setColor] = useState('#00D2FF');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  
  const [textInput, setTextInput] = useState<{ id?: string, x: number, y: number, value: string, fontSize: number, width: number, height: number, rotation?: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

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
    socket.on('load-canvas', (savedElements) => setElements(savedElements));
    socket.on('draw-line', ({ id, prevPoint, currentPoint, color, strokeWidth, tool }) => {
      setElements((prev) => [
        ...prev,
        { id: id || generateId(), tool, points: [prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y], color, strokeWidth },
      ]);
    });
    socket.on('draw-end-sync', ({ element }) => {
       setElements((prev) => [...prev, element]);
    });
    socket.on('element-updated', (updatedElement) => {
        setElements((prev) => prev.map((el) => el.id === updatedElement.id ? updatedElement : el));
    });
    socket.on('clear', () => {
        setElements([]);
        setSelectedId(null);
    });
    socket.on('cursor-update', ({ userId, x, y, color }) => {
      setCursors((prev) => ({ ...prev, [userId]: { x, y, color } }));
    });
    return () => {
      socket.off('load-canvas'); socket.off('draw-line'); socket.off('draw-end-sync');
      socket.off('element-updated'); socket.off('clear'); socket.off('cursor-update');
    };
  }, []);

  // --- STABLE TRANSFORMER ---
  useEffect(() => {
    if (selectedId && transformerRef.current && stageRef.current) {
      const node = stageRef.current.findOne('#' + selectedId);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
        transformerRef.current?.nodes([]);
    }
  }, [selectedId, elements]); 

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
    const clickedOnEmpty = e.target === e.target.getStage();
    
    if (clickedOnEmpty) {
      setSelectedId(null);
      if (textInput) handleTextSubmit(); 
    } else {
        if (tool === 'select') {
             setSelectedId(e.target.id());
             return;
        }
        if (tool === 'text' && e.target.getClassName() === 'Text') {
             const el = elements.find(item => item.id === e.target.id());
             if (el) openTextEditor(el);
             return;
        }
    }
    if (tool === 'move' || tool === 'select' || e.evt.button !== 0) return;
    if (textInput) { handleTextSubmit(); return; }

    isDrawing.current = true;
    const pos = getRelativePointerPosition(e.target.getStage()!);
    if (!pos) return;

    if (tool === 'text') {
        setPreviewRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
        return;
    }

    const id = generateId();
    let newElement;
    if (tool === 'pen' || tool === 'eraser') {
        newElement = { id, tool, points: [pos.x, pos.y], color: tool === 'eraser' ? '#ffffff' : color, strokeWidth: tool === 'eraser' ? 20 : 5 };
    } else if (tool === 'rect') {
        newElement = { id, tool: 'rect', x: pos.x, y: pos.y, width: 0, height: 0, color, strokeWidth: 5 };
    } else if (tool === 'circle') {
        newElement = { id, tool: 'circle', x: pos.x, y: pos.y, radius: 0, color, strokeWidth: 5 };
    }
    setElements([...elements, newElement]);
  };

  const handleMouseMove = (e: KonvaEventObject<any>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos || !roomId) return;
    
    emitCursorMove(pos.x, pos.y, roomId);

    if (tool === 'move' || tool === 'select' || !isDrawing.current) return;

    if (tool === 'text' && previewRect) {
        const newWidth = pos.x - previewRect.x;
        const newHeight = pos.y - previewRect.y;
        setPreviewRect({ ...previewRect, width: newWidth, height: newHeight });
        return;
    }

    const index = elements.length - 1;
    const currentElement = { ...elements[index] };

    if (tool === 'pen' || tool === 'eraser') {
        const prevX = currentElement.points[currentElement.points.length - 2];
        const prevY = currentElement.points[currentElement.points.length - 1];
        socket.emit('draw-line', {
            id: currentElement.id, prevPoint: { x: prevX, y: prevY }, currentPoint: { x: pos.x, y: pos.y },
            color: tool === 'eraser' ? '#ffffff' : color, strokeWidth: tool === 'eraser' ? 20 : 5, tool, roomId
        });
        currentElement.points = currentElement.points.concat([pos.x, pos.y]);
    } else if (tool === 'rect') {
        currentElement.width = pos.x - currentElement.x;
        currentElement.height = pos.y - currentElement.y;
    } else if (tool === 'circle') {
        const dx = pos.x - currentElement.x;
        const dy = pos.y - currentElement.y;
        currentElement.radius = Math.sqrt(dx * dx + dy * dy);
    }
    const newElements = [...elements];
    newElements[index] = currentElement;
    setElements(newElements);
  };

  const handleMouseUp = () => {
    if (tool === 'move' || tool === 'select') return;
    isDrawing.current = false;
    if (tool === 'text' && previewRect) {
        if (Math.abs(previewRect.width) < 5) { setPreviewRect(null); return; }
        setTextInput({
            x: previewRect.x, y: previewRect.y, value: '',
            fontSize: Math.abs(previewRect.height) * 0.7,
            width: Math.abs(previewRect.width), height: Math.abs(previewRect.height),
        });
        setPreviewRect(null);
        return;
    }
    const lastElement = elements[elements.length - 1];
    if (lastElement && roomId) socket.emit('draw-end', { roomId, element: lastElement });
  };

  // --- RESIZE LOGIC (FIXED FOR MAGNIFICATION) ---
  const handleTransformEnd = (e: KonvaEventObject<any>) => {
      const node = e.target;
      const id = node.id();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Reset scale immediately
      node.scaleX(1);
      node.scaleY(1);

      let newAttrs: any = {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: 1, scaleY: 1,
      };

      if (node.getClassName() === 'Text') {
          // BAKE scale into properties
          // If corner drag (scaleY changes), update Font Size (Magnify)
          // If side drag (scaleX changes), update Width (Reflow)
          const newFontSize = Math.max(10, (node as any).fontSize() * scaleY);
          const newWidth = Math.max(30, node.width() * scaleX);
          
          newAttrs.fontSize = newFontSize;
          newAttrs.width = newWidth;
      } else if (node.getClassName() === 'Rect') {
           newAttrs.width = Math.max(10, node.width() * scaleX);
           newAttrs.height = Math.max(10, node.height() * scaleY);
      } else if (node.getClassName() === 'Circle') {
           newAttrs.radius = Math.max(5, (node as any).radius() * scaleX);
      }

      setElements(prev => prev.map(el => el.id === id ? { ...el, ...newAttrs } : el));
      const updatedElement = elements.find(el => el.id === id);
      if (updatedElement) {
          socket.emit('update-element', { roomId, element: { ...updatedElement, ...newAttrs } });
      }
  };

  const openTextEditor = (el: any) => {
      setTextInput({
          id: el.id, x: el.x, y: el.y, value: el.text,
          fontSize: el.fontSize, width: el.width,
          height: el.height || (el.fontSize * 1.2), rotation: el.rotation
      });
  };

  const handleTextSubmit = () => {
      if (!textInput) return;
      if (!textInput.value.trim() && !textInput.id) { setTextInput(null); return; }
      const updatedProps = { text: textInput.value, fontSize: textInput.fontSize, width: textInput.width, color: color };

      if (textInput.id) {
          const original = elements.find(el => el.id === textInput.id);
          if (original) {
              const newEl = { ...original, ...updatedProps };
              setElements(prev => prev.map(el => el.id === textInput.id ? newEl : el));
              socket.emit('update-element', { roomId, element: newEl });
          }
      } else {
          const newEl = { id: generateId(), tool: 'text', x: textInput.x, y: textInput.y, ...updatedProps };
          setElements([...elements, newEl]);
          socket.emit('draw-end', { roomId, element: newEl });
      }
      setTextInput(null);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if(!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if(!pointer) return;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY > 0 ? oldScale / 1.1 : oldScale * 1.1;
    setStageScale(newScale);
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
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

  // Helper to force cursor style
  const cursorStyle = tool === 'select' ? 'default' : (tool === 'move' ? 'grab' : 'crosshair');

  return (
    <div className="relative w-screen h-screen bg-[#121212] overflow-hidden" style={{ cursor: cursorStyle }}>
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
        draggable={tool === 'move'}
        onWheel={handleWheel}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onDragEnd={(e) => { if (e.target === stageRef.current) setStagePos(e.target.position()); }}
      >
        <Grid stageScale={stageScale} stagePos={stagePos} width={window.innerWidth} height={window.innerHeight} />
        
        <Layer>
          {elements.map((el, i) => {
            // FIX: ADDED CURSOR EVENTS FOR DRAG
            const commonProps = {
                key: el.id, id: el.id, draggable: tool === 'select',
                onClick: () => { if(tool === 'select') setSelectedId(el.id); },
                onTap: () => { if(tool === 'select') setSelectedId(el.id); },
                onDragEnd: handleTransformEnd, onTransformEnd: handleTransformEnd,
                // --- CURSOR HOVER EFFECTS ---
                onMouseEnter: (e: any) => { 
                    if(tool === 'select') {
                        const container = e.target.getStage().container();
                        container.style.cursor = "move"; 
                    }
                },
                onMouseLeave: (e: any) => {
                    if(tool === 'select') {
                        const container = e.target.getStage().container();
                        container.style.cursor = "default";
                    }
                }
            };

            if (el.tool === 'pen' || el.tool === 'eraser') {
                return <Line {...commonProps} points={el.points} stroke={el.color} strokeWidth={el.strokeWidth} tension={0.5} lineCap="round" lineJoin="round" globalCompositeOperation={el.tool === 'eraser' ? 'destination-out' : 'source-over'} />;
            } else if (el.tool === 'rect') {
                return <Rect {...commonProps} x={el.x} y={el.y} width={el.width} height={el.height} stroke={el.color} strokeWidth={el.strokeWidth} cornerRadius={4} rotation={el.rotation} />;
            } else if (el.tool === 'circle') {
                return <Circle {...commonProps} x={el.x} y={el.y} radius={el.radius} stroke={el.color} strokeWidth={el.strokeWidth} rotation={el.rotation} />;
            } else if (el.tool === 'text') {
                return (
                    <KonvaText 
                        {...commonProps}
                        x={el.x} y={el.y} text={el.text} 
                        fontSize={el.fontSize} width={el.width}
                        fill={el.color} fontFamily="sans-serif"
                        rotation={el.rotation}
                        onDblClick={() => openTextEditor(el)}
                    />
                );
            }
            return null;
          })}

          <Transformer 
              ref={transformerRef} 
              anchorSize={10} 
              padding={5}     
              borderDash={[6, 2]}
              // Limit resize to prevent disappearing
              boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 20 || newBox.height < 10) return oldBox;
                  return newBox;
              }}
          />

          {previewRect && (
              <Rect x={previewRect.x} y={previewRect.y} width={previewRect.width} height={previewRect.height} stroke={color} strokeWidth={2} dash={[5, 5]} opacity={0.6} />
          )}
          {Object.entries(cursors).map(([userId, cursor]) => (
            <Cursor key={userId} userId={userId.slice(0, 4)} x={cursor.x} y={cursor.y} color={userId.slice(0, 6)} />
          ))}
        </Layer>
      </Stage>

      {textInput && (
          <textarea
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={handleTextSubmit}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleTextSubmit() }}
            style={{
                position: 'absolute',
                top: textInput.y * stageScale + stagePos.y, 
                left: textInput.x * stageScale + stagePos.x,
                width: textInput.width * stageScale,
                height: textInput.height ? textInput.height * stageScale : 'auto',
                fontSize: `${textInput.fontSize * stageScale}px`,
                transform: `rotate(${textInput.rotation || 0}deg)`,
                transformOrigin: 'top left',
                lineHeight: 1, color: color,
                background: 'rgba(0,0,0,0.8)', border: `1px solid ${color}`,
                outline: 'none', resize: 'none', overflow: 'hidden',
                zIndex: 100, padding: '0px', margin: '0px'
            }}
            autoFocus
          />
      )}

      {/* TOOLBAR */}
      <div className="absolute z-50 top-5 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm p-3 rounded-2xl border border-gray-700 shadow-2xl flex items-center gap-4">
        <div className="flex gap-2 pr-4 border-r border-gray-700">
          {colors.map((c) => (
            <button key={c.name} onClick={() => { setTool('pen'); setColor(c.value); }} className={`w-6 h-6 rounded-full transition-all ${color === c.value ? 'ring-2 ring-white scale-110' : 'opacity-70'}`} style={{ backgroundColor: c.value }} title={c.name} />
          ))}
        </div>
        <div className="flex gap-2">
            {[
                { id: 'select', Icon: Icons.Select, title: "Select" },
                { id: 'move', Icon: Icons.Hand, title: "Pan" },
                { id: 'pen', Icon: Icons.Pen, title: "Pen" },
                { id: 'rect', Icon: Icons.Rect, title: "Rectangle" },
                { id: 'circle', Icon: Icons.Circle, title: "Circle" },
                { id: 'text', Icon: Icons.Text, title: "Text" },
                { id: 'eraser', Icon: Icons.Eraser, title: "Eraser" },
            ].map((t: any) => (
                <button key={t.id} onClick={() => { setTool(t.id); setSelectedId(null); }} className={`p-2 rounded-lg transition-all ${tool === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} title={t.title}>
                    <t.Icon />
                </button>
            ))}
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            <button onClick={() => socket.emit('undo', roomId)} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-gray-400 hover:bg-gray-700">Undo</button>
            <button onClick={() => { setElements([]); socket.emit('clear', roomId); }} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-red-400 hover:bg-red-900/30">Clear</button>
            <button onClick={handleExport} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;