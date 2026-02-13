const https = require("https");

const REQUIRED_SMTP_ENV_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
];

const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 15000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 20000;
const DEFAULT_SMTP_DNS_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_RETRY_COUNT = 2;
const DEFAULT_SMTP_RETRY_DELAY_MS = 1500;
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const DEFAULT_TLS_MIN_VERSION = "TLSv1.2";

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
let smtpWarmupPromise = null;
let smtpWarmupStarted = false;

const getErrorMessage = (error) => {
  return error instanceof Error ? error.message : "Unknown mail service error";
};

const getErrorCode = (error) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "UNKNOWN";
  }

  return String(error.code || "UNKNOWN");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMissingSmtpEnvVars = () => {
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

const parseNonNegativeIntegerEnv = (key, fallback) => {
  const rawValue = process.env[key];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`Invalid ${key}. Provide a non-negative integer.`);
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

const getSmtpRetryConfig = () => {
  return {
    retries: parseNonNegativeIntegerEnv("SMTP_RETRY_COUNT", DEFAULT_SMTP_RETRY_COUNT),
    retryDelayMs: parsePositiveNumberEnv("SMTP_RETRY_DELAY_MS", DEFAULT_SMTP_RETRY_DELAY_MS),
  };
};

const getProviderTimeoutMs = () => {
  return parsePositiveNumberEnv("MAIL_PROVIDER_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
};

const requireMailerConfig = () => {
  const missingVars = getMissingSmtpEnvVars();
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
  };
};

const getMailFrom = () => {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "Auto Mate <no-reply@localhost>";
};

const getTransporter = () => {
  if (!nodemailer) {
    throw new Error("Nodemailer is not installed. Install it with: npm install nodemailer");
  }

  if (transporter) {
    return transporter;
  }

  const missingVars = getMissingSmtpEnvVars();
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

  const secure = smtpSecure === null ? smtpPort === 465 : smtpSecure;
  const tlsRejectUnauthorized = parseOptionalBooleanEnv("SMTP_TLS_REJECT_UNAUTHORIZED");
  const smtpRequireTlsOverride = parseOptionalBooleanEnv("SMTP_REQUIRE_TLS");
  const tlsMinVersion = process.env.SMTP_TLS_MIN_VERSION || DEFAULT_TLS_MIN_VERSION;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    requireTLS: smtpRequireTlsOverride === null ? !secure : smtpRequireTlsOverride,
    tls: {
      servername: smtpHost,
      minVersion: tlsMinVersion,
      rejectUnauthorized: tlsRejectUnauthorized === null ? true : tlsRejectUnauthorized,
    },
    ...getSmtpTimeoutConfig(),
  });

  usingDevelopmentFallback = false;
  return transporter;
};

const warmupTransporterAtStartup = async () => {
  if (smtpWarmupStarted) {
    return smtpWarmupPromise;
  }

  smtpWarmupStarted = true;
  smtpWarmupPromise = (async () => {
    if (!nodemailer) {
      // eslint-disable-next-line no-console
      console.error("[mail][startup] Nodemailer not installed; SMTP warmup skipped.");
      return false;
    }

    const missingVars = getMissingSmtpEnvVars();
    if (missingVars.length > 0) {
      if (process.env.NODE_ENV === "production") {
        // eslint-disable-next-line no-console
        console.error(
          `[mail][startup] SMTP warmup skipped; missing vars: ${missingVars.join(", ")}`,
        );
      }
      return false;
    }

    try {
      const mailTransporter = getTransporter();
      await mailTransporter.verify();
      // eslint-disable-next-line no-console
      console.log("[mail][startup] SMTP transporter verify succeeded.");
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[mail][startup] SMTP transporter verify failed (${getErrorCode(error)}): ${getErrorMessage(error)}`,
      );
      return false;
    }
  })();

  return smtpWarmupPromise;
};

const isSmtpTimeoutError = (error) => {
  const errorCode = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    ["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNRESET", "EAI_AGAIN"].includes(errorCode)
    || message.includes("timed out")
    || message.includes("timeout")
    || message.includes("greeting never received")
    || message.includes("connection closed")
  );
};

const sendViaSmtp = async (mailOptions) => {
  const { retries, retryDelayMs } = getSmtpRetryConfig();
  const totalAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const mailTransporter = getTransporter();
      const info = await mailTransporter.sendMail(mailOptions);

      return {
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        transport: usingDevelopmentFallback ? "development-fallback" : "smtp",
      };
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.error(
        `[mail][smtp] Send attempt ${attempt}/${totalAttempts} failed (${getErrorCode(error)}): ${getErrorMessage(error)}`,
      );

      if (attempt < totalAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError || new Error("SMTP send failed");
};

const parseMailFromAddress = (mailFrom) => {
  const trimmed = String(mailFrom || "").trim();
  const bracketMatch = trimmed.match(/^(.*)<([^>]+)>$/);

  if (bracketMatch) {
    const name = bracketMatch[1].trim().replace(/^"|"$/g, "");
    const email = bracketMatch[2].trim();
    return {
      email,
      name: name || undefined,
      raw: trimmed,
    };
  }

  return {
    email: trimmed,
    name: undefined,
    raw: trimmed,
  };
};

const requestJson = ({ hostname, path, headers, payload, timeoutMs }) => {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname,
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          let parsedBody = null;
          if (responseBody) {
            try {
              parsedBody = JSON.parse(responseBody);
            } catch (_error) {
              parsedBody = null;
            }
          }

          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
            rawBody: responseBody,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const extractProviderErrorMessage = (response) => {
  if (response.body && typeof response.body === "object") {
    if (typeof response.body.message === "string" && response.body.message.trim()) {
      return response.body.message;
    }

    if (typeof response.body.error === "string" && response.body.error.trim()) {
      return response.body.error;
    }

    if (Array.isArray(response.body.errors) && response.body.errors.length > 0) {
      const firstError = response.body.errors[0];
      if (typeof firstError === "string" && firstError.trim()) {
        return firstError;
      }
      if (
        firstError
        && typeof firstError === "object"
        && typeof firstError.message === "string"
        && firstError.message.trim()
      ) {
        return firstError.message;
      }
    }
  }

  if (response.rawBody) {
    return response.rawBody.slice(0, 300);
  }

  return "No additional details";
};

const sendViaResend = async ({ to, subject, htmlContent, mailFrom }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await requestJson({
    hostname: "api.resend.com",
    path: "/emails",
    timeoutMs: getProviderTimeoutMs(),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    payload: {
      from: mailFrom,
      to: [to],
      subject,
      html: htmlContent,
    },
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return {
      messageId: response.body?.id || null,
      accepted: [to],
      rejected: [],
      transport: "resend",
    };
  }

  throw new Error(
    `[resend] HTTP ${response.statusCode}: ${extractProviderErrorMessage(response)}`,
  );
};

const sendViaSendGrid = async ({ to, subject, htmlContent, mailFrom }) => {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }

  const from = parseMailFromAddress(mailFrom);
  if (!from.email || !from.email.includes("@")) {
    throw new Error("MAIL_FROM must contain a valid sender email for SendGrid fallback");
  }

  const response = await requestJson({
    hostname: "api.sendgrid.com",
    path: "/v3/mail/send",
    timeoutMs: getProviderTimeoutMs(),
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
    payload: {
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: from.name
        ? { email: from.email, name: from.name }
        : { email: from.email },
      subject,
      content: [
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    },
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const providerMessageId = response.headers["x-message-id"];
    return {
      messageId: Array.isArray(providerMessageId) ? providerMessageId[0] : providerMessageId || null,
      accepted: [to],
      rejected: [],
      transport: "sendgrid",
    };
  }

  throw new Error(
    `[sendgrid] HTTP ${response.statusCode}: ${extractProviderErrorMessage(response)}`,
  );
};

const sendViaFallbackProvider = async ({ to, subject, htmlContent, mailFrom }) => {
  const providers = [];
  if (process.env.RESEND_API_KEY) {
    providers.push({
      name: "resend",
      fn: sendViaResend,
    });
  }
  if (process.env.SENDGRID_API_KEY) {
    providers.push({
      name: "sendgrid",
      fn: sendViaSendGrid,
    });
  }

  if (providers.length === 0) {
    throw new Error("No fallback provider configured. Set RESEND_API_KEY or SENDGRID_API_KEY.");
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      return await provider.fn({
        to,
        subject,
        htmlContent,
        mailFrom,
      });
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.error(
        `[mail][${provider.name}] Fallback provider failed (${getErrorCode(error)}): ${getErrorMessage(error)}`,
      );
    }
  }

  throw lastError || new Error("All fallback providers failed");
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

  const mailFrom = getMailFrom();

  try {
    return await sendViaSmtp({
      from: mailFrom,
      to,
      subject,
      html: htmlContent,
    });
  } catch (smtpError) {
    const smtpErrorMessage = getErrorMessage(smtpError);
    const timeoutHint = isSmtpTimeoutError(smtpError)
      ? " Check SMTP_HOST/SMTP_PORT, Render egress rules, and Gmail app-password settings."
      : "";

    // eslint-disable-next-line no-console
    console.error(
      `[mail] SMTP send failed after retries (${getErrorCode(smtpError)}): ${smtpErrorMessage}.${timeoutHint}`,
    );

    try {
      const fallbackResult = await sendViaFallbackProvider({
        to,
        subject,
        htmlContent,
        mailFrom,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[mail] Sent using fallback transport '${fallbackResult.transport}' after SMTP failure.`,
      );
      return fallbackResult;
    } catch (fallbackError) {
      const wrappedError = new Error(
        `Failed to send email. SMTP error: ${smtpErrorMessage}. Fallback error: ${getErrorMessage(fallbackError)}`,
      );
      wrappedError.cause = fallbackError;
      throw wrappedError;
    }
  }
};

setImmediate(() => {
  warmupTransporterAtStartup().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[mail][startup] Unexpected warmup error: ${getErrorMessage(error)}`);
  });
});

module.exports = {
  sendMail,
};
