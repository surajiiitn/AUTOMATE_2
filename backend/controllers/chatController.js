const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const chatService = require("../services/chatService");

const getCurrentRoom = asyncHandler(async (req, res) => {
  const context = await chatService.getCurrentChatContext(req.user);
  return success(res, { room: context });
});

const getMessages = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const messages = await chatService.getRideMessages(req.user, rideId);
  return success(res, { messages });
});

const sendMessage = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const { content } = req.body;
  const message = await chatService.sendRideMessage(req.user, rideId, content);
  return success(res, { message }, "Message sent", 201);
});

module.exports = {
  getCurrentRoom,
  getMessages,
  sendMessage,
};
