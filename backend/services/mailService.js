const { Resend } = require("resend");

const MAIL_FROM = "Auto Mate <onboarding@resend.dev>";

let resendClient = null;

const getErrorMessage = (error) => {
  if (!error) {
    return "Unknown error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
};

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey.trim());
  }

  return resendClient;
};

const sendMail = async (to, subject, html) => {
  if (!to || typeof to !== "string") {
    throw new Error("Invalid recipient email.");
  }

  if (!subject || typeof subject !== "string") {
    throw new Error("Invalid email subject.");
  }

  if (!html || typeof html !== "string") {
    throw new Error("Invalid email html content.");
  }

  const resend = getResendClient();

  try {
    const response = await resend.emails.send({
      from: MAIL_FROM,
      to: [to],
      subject,
      html,
    });

    if (response?.error) {
      throw new Error(getErrorMessage(response.error));
    }

    const messageId = response?.data?.id || response?.id || null;

    // eslint-disable-next-line no-console
    console.log(
      `[mail][resend] Email sent successfully to=${to} messageId=${messageId || "n/a"}`,
    );

    return {
      transport: "resend",
      messageId,
      accepted: [to],
      rejected: [],
    };
  } catch (error) {
    const message = getErrorMessage(error);

    // eslint-disable-next-line no-console
    console.error(`[mail][resend] Failed to send email to=${to}: ${message}`);

    const wrappedError = new Error(`Failed to send email via Resend: ${message}`);
    wrappedError.cause = error;
    throw wrappedError;
  }
};

module.exports = {
  sendMail,
};
