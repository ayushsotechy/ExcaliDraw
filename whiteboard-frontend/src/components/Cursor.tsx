import React from 'react';
import { Circle, Group, Text } from 'react-konva';

interface CursorProps {
  x: number;
  y: number;
  color: string;
  userId: string;
}

const Cursor: React.FC<CursorProps> = ({ x, y, color, userId }) => {
  return (
    <Group x={x} y={y}>
      {/* The Cursor Dot */}
      <Circle radius={6} fill={`#${color}`} stroke="white" strokeWidth={2} />
      
      {/* The User Label */}
      <Text 
        text={userId} 
        fontSize={12} 
        fill="white" 
        y={10} 
        x={5}
        shadowColor="black"
        shadowBlur={2}
      />
    </Group>
  );
};

export default Cursor;