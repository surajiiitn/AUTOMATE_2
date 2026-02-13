const https = require("https");

let nodemailer;
try {
  // eslint-disable-next-line global-require
  nodemailer = require("nodemailer");
} catch (_error) {
  nodemailer = null;
}

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 15000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 25000;
const DEFAULT_SMTP_DNS_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_RETRY_COUNT = 2;
const DEFAULT_SMTP_RETRY_DELAY_MS = 1500;
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const DEFAULT_PROVIDER_RETRY_COUNT = 2;
const DEFAULT_PROVIDER_RETRY_DELAY_MS = 1500;
const DEFAULT_TLS_MIN_VERSION = "TLSv1.2";

let smtpTransporter = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};

const getErrorCode = (error) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "UNKNOWN";
  }

  return String(error.code || "UNKNOWN");
};

const parseBooleanEnv = (key, fallback = null) => {
  const value = process.env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${key}. Use true/false.`);
};

const parsePositiveNumberEnv = (key, fallback) => {
  const value = process.env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}. Use a positive number.`);
  }

  return parsed;
};

const parseNonNegativeIntegerEnv = (key, fallback) => {
  const value = process.env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${key}. Use a non-negative integer.`);
  }

  return parsed;
};

const maskSecret = (value) => {
  if (!value || typeof value !== "string") {
    return "missing";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

const isSmtpTimeoutOrNetworkError = (error) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    [
      "ETIMEDOUT",
      "ESOCKET",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "ECONNRESET",
      "ECONNREFUSED",
      "ECONNECTION",
      "EAI_AGAIN",
    ].includes(code)
    || message.includes("timeout")
    || message.includes("timed out")
    || message.includes("greeting never received")
    || message.includes("connection closed")
  );
};

const getMailFrom = () => {
  return (
    process.env.MAIL_FROM
    || process.env.RESEND_FROM
    || process.env.SENDGRID_FROM
    || process.env.SMTP_USER
    || "Auto Mate <no-reply@localhost>"
  );
};

const getSmtpConfig = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";

  if (!user || !pass) {
    return {
      enabled: false,
      reason: "SMTP_USER/SMTP_PASS (or GMAIL_USER/GMAIL_APP_PASSWORD) missing",
    };
  }

  const port = parsePositiveNumberEnv("SMTP_PORT", DEFAULT_SMTP_PORT);
  const secure = parseBooleanEnv("SMTP_SECURE", port === 465);
  const requireTLS = parseBooleanEnv("SMTP_REQUIRE_TLS", true);
  const rejectUnauthorized = parseBooleanEnv("SMTP_TLS_REJECT_UNAUTHORIZED", true);
  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;

  return {
    enabled: true,
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS,
    tls: {
      servername: host,
      minVersion: process.env.SMTP_TLS_MIN_VERSION || DEFAULT_TLS_MIN_VERSION,
      rejectUnauthorized,
    },
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
    dnsTimeout: parsePositiveNumberEnv("SMTP_DNS_TIMEOUT_MS", DEFAULT_SMTP_DNS_TIMEOUT_MS),
  };
};

const getSmtpTransporter = () => {
  if (!nodemailer) {
    throw new Error("Nodemailer is not installed.");
  }

  const smtpConfig = getSmtpConfig();
  if (!smtpConfig.enabled) {
    throw new Error(`SMTP disabled: ${smtpConfig.reason}`);
  }

  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
    requireTLS: smtpConfig.requireTLS,
    tls: smtpConfig.tls,
    connectionTimeout: smtpConfig.connectionTimeout,
    greetingTimeout: smtpConfig.greetingTimeout,
    socketTimeout: smtpConfig.socketTimeout,
    dnsTimeout: smtpConfig.dnsTimeout,
  });

  return smtpTransporter;
};

const parseFromAddress = (value) => {
  const raw = String(value || "").trim();
  const bracketMatch = raw.match(/^(.*)<([^>]+)>$/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim().replace(/^"|"$/g, "");
    const email = bracketMatch[2].trim();
    return {
      raw,
      email,
      name: name || undefined,
    };
  }

  return {
    raw,
    email: raw,
    name: undefined,
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
        let rawBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          rawBody += chunk;
        });
        res.on("end", () => {
          let parsedBody = null;
          if (rawBody) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch (_error) {
              parsedBody = null;
            }
          }

          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
            rawBody,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const extractProviderError = (response) => {
  if (response.body && typeof response.body === "object") {
    if (typeof response.body.message === "string" && response.body.message.trim()) {
      return response.body.message;
    }
    if (typeof response.body.error === "string" && response.body.error.trim()) {
      return response.body.error;
    }
    if (Array.isArray(response.body.errors) && response.body.errors.length > 0) {
      const firstError = response.body.errors[0];
      if (typeof firstError === "string") {
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

  return "No provider error details";
};

const withRetries = async ({
  label,
  retries,
  retryDelayMs,
  shouldRetry = () => true,
  task,
}) => {
  const totalAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await task(attempt, totalAttempts);
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.error(
        `[mail][${label}] attempt ${attempt}/${totalAttempts} failed (${getErrorCode(error)}): ${getErrorMessage(error)}`,
      );

      if (attempt < totalAttempts && shouldRetry(error)) {
        await sleep(retryDelayMs);
      } else if (attempt < totalAttempts) {
        break;
      }
    }
  }

  throw lastError || new Error(`All ${label} attempts failed`);
};

const sendViaSmtp = async ({ to, subject, htmlContent, mailFrom }) => {
  const retries = parseNonNegativeIntegerEnv("SMTP_RETRY_COUNT", DEFAULT_SMTP_RETRY_COUNT);
  const retryDelayMs = parsePositiveNumberEnv("SMTP_RETRY_DELAY_MS", DEFAULT_SMTP_RETRY_DELAY_MS);

  return withRetries({
    label: "smtp",
    retries,
    retryDelayMs,
    shouldRetry: () => true,
    task: async () => {
      const transporter = getSmtpTransporter();
      const info = await transporter.sendMail({
        from: mailFrom,
        to,
        subject,
        html: htmlContent,
      });

      return {
        transport: "smtp",
        messageId: info.messageId || null,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
      };
    },
  });
};

const sendViaResend = async ({ to, subject, htmlContent, mailFrom }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const response = await requestJson({
    hostname: "api.resend.com",
    path: "/emails",
    timeoutMs: parsePositiveNumberEnv("MAIL_PROVIDER_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    payload: {
      from: process.env.RESEND_FROM || mailFrom,
      to: [to],
      subject,
      html: htmlContent,
    },
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return {
      transport: "resend",
      messageId: response.body?.id || null,
      accepted: [to],
      rejected: [],
    };
  }

  throw new Error(`[resend] HTTP ${response.statusCode}: ${extractProviderError(response)}`);
};

const sendViaSendGrid = async ({ to, subject, htmlContent, mailFrom }) => {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY not configured");
  }

  const from = parseFromAddress(process.env.SENDGRID_FROM || mailFrom);
  if (!from.email || !from.email.includes("@")) {
    throw new Error("Invalid sender email for SendGrid. Set SENDGRID_FROM or MAIL_FROM.");
  }

  const response = await requestJson({
    hostname: "api.sendgrid.com",
    path: "/v3/mail/send",
    timeoutMs: parsePositiveNumberEnv("MAIL_PROVIDER_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
    payload: {
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: from.name ? { email: from.email, name: from.name } : { email: from.email },
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
      transport: "sendgrid",
      messageId: Array.isArray(providerMessageId)
        ? providerMessageId[0]
        : providerMessageId || null,
      accepted: [to],
      rejected: [],
    };
  }

  throw new Error(`[sendgrid] HTTP ${response.statusCode}: ${extractProviderError(response)}`);
};

const sendViaFallbackProviders = async ({ to, subject, htmlContent, mailFrom }) => {
  const providers = [];

  if (process.env.RESEND_API_KEY) {
    providers.push({
      name: "resend",
      send: sendViaResend,
    });
  }
  if (process.env.SENDGRID_API_KEY) {
    providers.push({
      name: "sendgrid",
      send: sendViaSendGrid,
    });
  }

  if (providers.length === 0) {
    throw new Error("No fallback email API configured (RESEND_API_KEY or SENDGRID_API_KEY).");
  }

  const retries = parseNonNegativeIntegerEnv(
    "MAIL_PROVIDER_RETRY_COUNT",
    DEFAULT_PROVIDER_RETRY_COUNT,
  );
  const retryDelayMs = parsePositiveNumberEnv(
    "MAIL_PROVIDER_RETRY_DELAY_MS",
    DEFAULT_PROVIDER_RETRY_DELAY_MS,
  );

  const failures = [];

  for (const provider of providers) {
    try {
      const result = await withRetries({
        label: provider.name,
        retries,
        retryDelayMs,
        task: async () => {
          return provider.send({
            to,
            subject,
            htmlContent,
            mailFrom,
          });
        },
      });

      return result;
    } catch (error) {
      failures.push(`${provider.name}: ${getErrorMessage(error)}`);
      // eslint-disable-next-line no-console
      console.error(
        `[mail][${provider.name}] exhausted retries (${getErrorCode(error)}): ${getErrorMessage(error)}`,
      );
    }
  }

  throw new Error(`All fallback providers failed. ${failures.join(" | ")}`);
};

const sendMail = async (to, subject, htmlContent) => {
  if (!to || typeof to !== "string") {
    throw new Error("Invalid recipient email");
  }
  if (!subject || typeof subject !== "string") {
    throw new Error("Invalid email subject");
  }
  if (!htmlContent || typeof htmlContent !== "string") {
    throw new Error("Invalid email html content");
  }

  const mailFrom = getMailFrom();

  try {
    const smtpResult = await sendViaSmtp({
      to,
      subject,
      htmlContent,
      mailFrom,
    });
    // eslint-disable-next-line no-console
    console.log(`[mail] delivered via SMTP (messageId=${smtpResult.messageId || "n/a"})`);
    return smtpResult;
  } catch (smtpError) {
    const timeoutHint = isSmtpTimeoutOrNetworkError(smtpError)
      ? " Likely outbound SMTP blocked from hosting provider; using API fallback."
      : "";

    // eslint-disable-next-line no-console
    console.error(
      `[mail] SMTP failed (${getErrorCode(smtpError)}): ${getErrorMessage(smtpError)}.${timeoutHint}`,
    );
  }

  try {
    const fallbackResult = await sendViaFallbackProviders({
      to,
      subject,
      htmlContent,
      mailFrom,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[mail] delivered via fallback '${fallbackResult.transport}' (messageId=${fallbackResult.messageId || "n/a"})`,
    );
    return fallbackResult;
  } catch (fallbackError) {
    const error = new Error(
      `Email delivery failed on SMTP and fallback APIs: ${getErrorMessage(fallbackError)}`,
    );
    error.cause = fallbackError;
    throw error;
  }
};

const warmupSmtp = async () => {
  if (!nodemailer) {
    // eslint-disable-next-line no-console
    console.error("[mail][startup] Nodemailer not installed; SMTP warmup skipped.");
    return;
  }

  const smtpConfig = getSmtpConfig();
  if (!smtpConfig.enabled) {
    // eslint-disable-next-line no-console
    console.error(`[mail][startup] SMTP warmup skipped: ${smtpConfig.reason}`);
    return;
  }

  try {
    const transporter = getSmtpTransporter();
    await transporter.verify();
    // eslint-disable-next-line no-console
    console.log(
      `[mail][startup] SMTP verify succeeded host=${smtpConfig.host}:${smtpConfig.port} user=${maskSecret(smtpConfig.auth.user)}`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[mail][startup] SMTP verify failed (${getErrorCode(error)}): ${getErrorMessage(error)}`,
    );
  }
};

setImmediate(() => {
  warmupSmtp().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[mail][startup] unexpected warmup error: ${getErrorMessage(error)}`);
  });
});

module.exports = {
  sendMail,
};
