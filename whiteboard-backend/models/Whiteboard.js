const mongoose = require("mongoose");

const WhiteboardSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  // FIX: Use 'Mixed' type. This allows Lines (points) AND Shapes (width/height) to coexist.
  lines: { type: [mongoose.Schema.Types.Mixed], default: [] } 
});

module.exports = mongoose.model("Whiteboard", WhiteboardSchema);