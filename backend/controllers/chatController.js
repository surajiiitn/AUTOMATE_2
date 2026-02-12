const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const chatService = require("../services/chatService");

const getCurrentRoom = asyncHandler(async (req, res) => {
  const context = await chatService.getCurrentChatContext(req.user._id);
  const room = context?.defaultRoom
    ? {
        rideId: context.defaultRoom.roomId,
        otherUser: context.defaultRoom.otherUser || null,
      }
    : null;

  return success(res, { context, room });
});

const getMessagesByRoom = asyncHandler(async (req, res) => {
  const roomType = typeof req.query.roomType === "string" ? req.query.roomType : "";
  const roomId = typeof req.query.roomId === "string" ? req.query.roomId : "";
  const messages = await chatService.getRoomMessages(req.user._id, roomType, roomId);
  return success(res, { messages });
});

const sendMessageByRoom = asyncHandler(async (req, res) => {
  const { roomType, roomId, content } = req.body;
  const message = await chatService.sendMessageToRoom(req.user._id, roomType, roomId, content);
  return success(res, { message }, "Message sent", 201);
});

const getMessages = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const messages = await chatService.getRideMessages(req.user._id, rideId);
  return success(res, { messages });
});

const sendMessage = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const { content } = req.body;
  const message = await chatService.sendRideMessage(req.user._id, rideId, content);
  return success(res, { message }, "Message sent", 201);
});

module.exports = {
  getCurrentRoom,
  getMessagesByRoom,
  sendMessageByRoom,
  getMessages,
  sendMessage,
};
