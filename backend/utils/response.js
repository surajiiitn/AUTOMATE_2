const success = (res, data, message = "OK", statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

module.exports = { success };
