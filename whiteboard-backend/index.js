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
// Replace this string with your actual MongoDB URI if you have one, 
// or use a local one: "mongodb://localhost:27017/whiteboard"
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/whiteboard")
  .then(() => console.log("MONGODB CONNECTED"))
  .catch((err) => console.log(err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // Allow all origins for now
});

io.on("connection", (socket) => {
  // 1. Join Room & Load Data
  socket.on("join-room", async (roomId) => {
    socket.join(roomId);
    const roomData = await Whiteboard.findOneAndUpdate(
      { roomId },
      { $setOnInsert: { lines: [] } }, // Only set 'lines' if creating a NEW doc
      { upsert: true, new: true }      // Create if missing, return the document
    );
    socket.emit("load-canvas", roomData.lines);
  });

  // 2. DRAWING (Real-time broadcasting only)
  // We DO NOT save to DB here anymore. This fixes the "Segmentation" bug.
  socket.on("draw-line", ({ prevPoint, currentPoint, color, strokeWidth, roomId }) => {
    socket.to(roomId).emit("draw-line", { 
      prevPoint, currentPoint, color, strokeWidth 
    });
  });

  // 3. DRAW END (Save the FULL line to DB)
  // This fires only when the user lifts their mouse.
  socket.on("draw-end", async ({ roomId, line }) => {
    try {
      await Whiteboard.updateOne(
        { roomId },
        { $push: { lines: line } } // Save the complete smooth curve
      );
    } catch (err) {
      console.error("Error saving line:", err);
    }
  });

  // 4. UNDO (Sync across users)
  socket.on("undo", async (roomId) => {
    try {
      const room = await Whiteboard.findOne({ roomId });
      
      if (room && room.lines.length > 0) {
        // 1. Remove the last line from the Database
        room.lines.pop(); 
        await room.save();

        // 2. CRITICAL FIX: Instead of emitting "undo", send the FRESH data
        // This ensures all clients (Screen A & B) are perfectly synced with the DB.
        io.to(roomId).emit("load-canvas", room.lines); 
      }
    } catch (err) {
      console.error("Error undoing:", err);
    }
  });
  // 5. CLEAR & CURSOR (Keep as is)
  socket.on("clear", async (roomId) => {
    io.to(roomId).emit("clear");
    await Whiteboard.updateOne({ roomId }, { lines: [] });
  });

  socket.on("cursor-move", ({ x, y, roomId }) => {
    socket.to(roomId).emit("cursor-update", { 
      userId: socket.id, x, y, color: socket.id.slice(0, 6) 
    });
  });
});

server.listen(3001, () => {
  console.log("SERVER RUNNING ON PORT 3001");
});