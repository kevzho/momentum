import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/features/auth/actions";

const { signInMock, requestPasswordResetMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  requestPasswordResetMock: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({
  signIn: signInMock,
  requestPasswordReset: requestPasswordResetMock,
}));

const { SignInForm } = await import("@/features/auth/components/sign-in-form");
const { RequestResetForm } = await import("@/features/auth/components/request-reset-form");

describe("after a failed sign-in", () => {
  it("puts focus on the message, not on <body>", async () => {
    signInMock.mockResolvedValue({
      ok: false,
      error: {
        code: "unauthenticated",
        message: "That email and password do not match an account.",
      },
    } satisfies AuthResult);

    render(<SignInForm next={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@momentum.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });

    const submit = screen.getByRole("button", { name: "Sign in" });
    submit.focus();
    await act(async () => {
      fireEvent.submit(submit.closest("form") as HTMLFormElement);
    });

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("after a reset request", () => {
  it("puts focus on the confirmation that replaced the form", async () => {
    requestPasswordResetMock.mockResolvedValue({
      ok: true,
      data: { message: "If demo@momentum.test has an account, a reset link is on its way." },
    } satisfies AuthResult);

    render(<RequestResetForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@momentum.test" } });
    const submit = screen.getByRole("button", { name: "Send reset link" });
    submit.focus();
    await act(async () => {
      fireEvent.submit(submit.closest("form") as HTMLFormElement);
    });

    const status = await screen.findByRole("status");
    await waitFor(() => expect(document.activeElement).toBe(status));
  });
});
