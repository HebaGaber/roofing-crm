import { describe, expect, it } from "vitest";
import { classifySignInError } from "../../src/auth/signIn.js";

describe("classifySignInError (T020, AC-3: never a raw/generic error)", () => {
  it("classifies the lockout handler's message as lockout, with the exact typed text", () => {
    const result = classifySignInError(
      new Error("Too many attempts — try again in 5 minutes (retry at 2026-10-23T00:05:00.000Z)."),
    );
    expect(result.kind).toBe("lockout");
    expect(result.message).toBe("Too many attempts — try again in 5 minutes.");
  });

  it("classifies a NotAuthorizedException as invalid-credentials", () => {
    const error = Object.assign(new Error("Incorrect username or password."), {
      code: "NotAuthorizedException",
    });
    const result = classifySignInError(error);
    expect(result.kind).toBe("invalid-credentials");
  });

  it("falls back to a typed unknown message, never the raw error, for anything else", () => {
    const result = classifySignInError(new Error("ECONNRESET at line 42"));
    expect(result.kind).toBe("unknown");
    expect(result.message).toBe("Sign-in failed. Please try again.");
  });
});
