require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const Whiteboard = require("./models/Whiteboard"); // Import Model

const app = express();
app.use(cors());

// 1. CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://ayushverma3006_db_user:utterlai@cluster0.oxv4wwb.mongodb.net/?appName=Cluster0")
  .then(() => console.log("MONGODB CONNECTED"))
  .catch((err) => console.log(err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  // 1. Join Room & Load Data
  socket.on("join-room", async (roomId) => {
    socket.join(roomId);
    
    // Using findOneAndUpdate with upsert to prevent race conditions
    const roomData = await Whiteboard.findOneAndUpdate(
      { roomId },
      { $setOnInsert: { lines: [] } }, 
      { upsert: true, new: true }
    );
    
    // Send existing data (Lines, Shapes, Text)
    socket.emit("load-canvas", roomData.lines);
  });

  // 2. DRAWING - PEN/ERASER (Stream of points)
  // Used for smooth freehand drawing
  socket.on("draw-line", ({ prevPoint, currentPoint, color, strokeWidth, tool, roomId }) => {
    socket.to(roomId).emit("draw-line", { 
      prevPoint, currentPoint, color, strokeWidth, tool 
    });
  });

  // 3. DRAWING - SHAPES (Real-time Preview)
  // NEW: Used to show the shape growing/moving on other screens while dragging
  socket.on("draw-preview", ({ roomId, element }) => {
    socket.to(roomId).emit("draw-preview", { element });
  });

  // 4. DRAW END (Save the finished Element to DB)
  // Works for both Lines (mouse up) and Shapes (drag end)
  socket.on("draw-end", async ({ roomId, element }) => {
    try {
      await Whiteboard.updateOne(
        { roomId },
        { $push: { lines: element } } // pushing generic 'element' to 'lines' array
      );
      
      // Broadcast the final solidified element to ensure sync
      socket.to(roomId).emit("draw-end-sync", { element });
    } catch (err) {
      console.error("Error saving element:", err);
    }
  });

  // 5. UNDO (Sync across users)
  socket.on("undo", async (roomId) => {
    try {
      const room = await Whiteboard.findOne({ roomId });
      
      if (room && room.lines.length > 0) {
        // Remove the last item (Line or Shape)
        room.lines.pop(); 
        await room.save();

        // Send the fresh list to everyone
        io.to(roomId).emit("load-canvas", room.lines); 
      }
    } catch (err) {
      console.error("Error undoing:", err);
    }
  });

  // 6. CLEAR CANVAS
  socket.on("clear", async (roomId) => {
    io.to(roomId).emit("clear");
    await Whiteboard.updateOne({ roomId }, { lines: [] });
  });

  // 7. CURSOR PRESENCE
  socket.on("cursor-move", ({ x, y, roomId }) => {
    socket.to(roomId).emit("cursor-update", { 
      userId: socket.id, x, y, color: socket.id.slice(0, 6) 
    });
  });
  // ... existing code ...

  // 6. UPDATE ELEMENT (Editing Text/Shapes)
  socket.on("update-element", async ({ roomId, element }) => {
    try {
      // Find the room and update the specific element in the 'lines' array by its ID
      await Whiteboard.updateOne(
        { roomId, "lines.id": element.id },
        { $set: { "lines.$": element } }
      );
      
      // Tell everyone else to update their local version
      socket.to(roomId).emit("element-updated", element);
    } catch (err) {
      console.error("Error updating element:", err);
    }
  });

  // ... rest of code (undo, clear, etc) ...
});

server.listen(3001, () => {
  console.log("SERVER RUNNING ON PORT 3001");
});