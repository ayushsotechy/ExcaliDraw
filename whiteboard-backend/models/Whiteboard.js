const mongoose = require("mongoose");

const WhiteboardSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  lines: [
    {
      tool: String,
      color: String,
      strokeWidth: Number,
      points: [Number], // Array of x,y coordinates
    },
  ],
});

module.exports = mongoose.model("Whiteboard", WhiteboardSchema);