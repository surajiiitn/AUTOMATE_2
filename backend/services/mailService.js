const REQUIRED_SMTP_ENV_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
];

const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 15000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 20000;
const DEFAULT_SMTP_DNS_TIMEOUT_MS = 10000;

let nodemailer;
try {
  // Lazy-safe load so this module can exist before dependency install.
  // eslint-disable-next-line global-require
  nodemailer = require("nodemailer");
} catch (_error) {
  nodemailer = null;
}

let transporter = null;
let usingDevelopmentFallback = false;

const getMissingEnvVars = () => {
  return REQUIRED_SMTP_ENV_VARS.filter((key) => !process.env[key]);
};

const parsePositiveNumberEnv = (key, fallback) => {
  const rawValue = process.env[key];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${key}. Provide a positive number in milliseconds.`);
  }

  return parsedValue;
};

const parseOptionalBooleanEnv = (key) => {
  const rawValue = process.env[key];
  if (!rawValue) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalizedValue)) {
    return false;
  }

  throw new Error(`Invalid ${key}. Use true or false.`);
};

const getSmtpTimeoutConfig = () => {
  return {
    connectionTimeout: parsePositiveNumberEnv(
      "SMTP_CONNECTION_TIMEOUT_MS",
      DEFAULT_SMTP_CONNECTION_TIMEOUT_MS,
    ),
    greetingTimeout: parsePositiveNumberEnv(
      "SMTP_GREETING_TIMEOUT_MS",
      DEFAULT_SMTP_GREETING_TIMEOUT_MS,
    ),
    socketTimeout: parsePositiveNumberEnv(
      "SMTP_SOCKET_TIMEOUT_MS",
      DEFAULT_SMTP_SOCKET_TIMEOUT_MS,
    ),
    dnsTimeout: parsePositiveNumberEnv(
      "SMTP_DNS_TIMEOUT_MS",
      DEFAULT_SMTP_DNS_TIMEOUT_MS,
    ),
  };
};

const requireMailerConfig = () => {
  const missingVars = getMissingEnvVars();
  if (missingVars.length > 0) {
    throw new Error(`Missing required SMTP environment variables: ${missingVars.join(", ")}`);
  }

  const smtpPort = Number(process.env.SMTP_PORT);
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    throw new Error("Invalid SMTP_PORT. Provide a valid numeric port.");
  }

  return {
    smtpHost: process.env.SMTP_HOST,
    smtpPort,
    smtpSecure: parseOptionalBooleanEnv("SMTP_SECURE"),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM,
  };
};

const getTransporter = () => {
  if (!nodemailer) {
    throw new Error("Nodemailer is not installed. Install it with: npm install nodemailer");
  }

  if (transporter) {
    return transporter;
  }

  const missingVars = getMissingEnvVars();
  const isProduction = process.env.NODE_ENV === "production";

  if (missingVars.length > 0) {
    if (isProduction) {
      throw new Error(`Missing required SMTP environment variables: ${missingVars.join(", ")}`);
    }

    // Local/dev fallback so mail-dependent flows can continue without SMTP credentials.
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    usingDevelopmentFallback = true;
    return transporter;
  }

  const {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
  } = requireMailerConfig();

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure === null ? smtpPort === 465 : smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    ...getSmtpTimeoutConfig(),
  });

  return transporter;
};

const sendMail = async (to, subject, htmlContent) => {
  if (!to || typeof to !== "string") {
    throw new Error("Invalid 'to' email address");
  }

  if (!subject || typeof subject !== "string") {
    throw new Error("Invalid email subject");
  }

  if (!htmlContent || typeof htmlContent !== "string") {
    throw new Error("Invalid email HTML content");
  }

  const hasSmtpConfig = getMissingEnvVars().length === 0;
  const mailFrom = hasSmtpConfig
    ? requireMailerConfig().mailFrom
    : (process.env.MAIL_FROM || "Auto Mate <no-reply@localhost>");

  try {
    const mailTransporter = getTransporter();
    const info = await mailTransporter.sendMail({
      from: mailFrom,
      to,
      subject,
      html: htmlContent,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      transport: usingDevelopmentFallback ? "development-fallback" : "smtp",
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown mail service error";
    const isTimeoutError = error
      && typeof error === "object"
      && (
        error.code === "ETIMEDOUT"
        || error.code === "ESOCKET"
        || rawMessage.toLowerCase().includes("timed out")
      );
    const message = isTimeoutError
      ? `${rawMessage}. Check SMTP_HOST/SMTP_PORT and your server outbound firewall rules.`
      : rawMessage;
    const wrappedError = new Error(`Failed to send email: ${message}`);
    wrappedError.cause = error;
    throw wrappedError;
  }
};

module.exports = {
  sendMail,
};
