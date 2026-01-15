import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import Whiteboard from './components/Whiteboard';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* 1. Root Path: Redirect to a new random room ID */}
        <Route path="/" element={<Navigate to={`/${uuidv4()}`} replace />} />
        
        {/* 2. Room Path: Render the Whiteboard */}
        <Route path="/:roomId" element={<Whiteboard />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;