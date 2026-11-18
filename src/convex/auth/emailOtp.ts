import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// Sign-in codes are emailed by the freebuff integrations gateway, which knows
// this project by its own key: VLY_INTEGRATION_KEY, a Convex environment
// variable issued when the project is created through freebuff. A deployment
// made with plain `convex dev` does not have one, so the failure has to be
// legible: name the variable, the command that sets it, and the way round it.
const MISSING_INTEGRATION_KEY =
  "Email sign-in is not configured on this deployment: VLY_INTEGRATION_KEY is unset, so no sign-in code can be sent. Set it with `npx convex env set VLY_INTEGRATION_KEY <key>`, or sign in as a guest instead - the bus, /devices and Latch all work without email sign-in. See MEBOARD_START_HERE.md.";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const key = freebuffEmailOtpKey();
    if (!key) {
      // Deliberately still an error rather than a quiet return: Convex Auth
      // reports a successful send if this resolves, and the person would then
      // sit waiting for an email that was never going to arrive.
      throw new Error(MISSING_INTEGRATION_KEY);
    }
    try {
      await axios.post(
        freebuffEmailOtpUrl(),
        { to: email, otp: token },
        { headers: { Authorization: `Bearer ${key}` } },
      );
    } catch (error) {
      throw freebuffEmailOtpError(error);
    }
  },
});

function freebuffEmailOtpKey(): string | null {
  const key = process.env.VLY_INTEGRATION_KEY?.trim();
  return key ? key : null;
}

// The email's wording is fixed by the gateway.
function freebuffEmailOtpUrl(): string {
  const base =
    process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai";
  return `${base.replace(/\/+$/, "")}/v1/email/otp`;
}

// Never stringify the whole request error: it carries the request headers.
function freebuffEmailOtpError(error: unknown): Error {
  const response = (
    error as { response?: { status?: number; data?: { error?: unknown } } }
  )?.response;
  if (response) {
    const detail =
      typeof response.data?.error === "string" ? `: ${response.data.error}` : "";
    return new Error(
      `Could not send the sign-in code (HTTP ${response.status})${detail}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not send the sign-in code: ${message}`);
}
