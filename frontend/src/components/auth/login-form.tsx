"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  LogInIcon,
  MailIcon,
} from "@/components/ui/icons";
import {
  isEndedSessionError,
  isExpiredSessionError,
  login,
  loginErrorMessage,
  loginInputSchema,
  type LoginInput,
} from "@/lib/api/auth";
import { toApiError, type ApiError } from "@/lib/api/client";
import { safeReturnTarget } from "@/lib/auth/navigation";
import { signInAndCacheCurrentAuth } from "@/lib/auth/sign-in";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";

function validateEmail(value: string): true | string {
  const result = loginInputSchema.shape.email.safeParse(value);
  return result.success
    ? true
    : (result.error.issues[0]?.message ?? "Enter a valid email address.");
}

function validatePassword(value: string): true | string {
  const result = loginInputSchema.shape.password.safeParse(value);
  return result.success
    ? true
    : (result.error.issues[0]?.message ?? "Enter your password.");
}

function SessionCheck() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-72 flex-col items-center justify-center px-6 py-10 text-center"
      role="status"
    >
      <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <p className="mt-4 text-sm font-semibold text-ink">
        Checking your session
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Existing secure access will be resumed automatically.
      </p>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<ApiError | null>(null);
  const returnTarget = safeReturnTarget(searchParams.get("returnTo"));
  const currentAuth = useQuery({
    ...currentAuthQueryOptions,
    retry: false,
    refetchOnMount: "always",
  });
  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors },
  } = useForm<LoginInput>({
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const verifiedExistingSession =
    currentAuth.data !== undefined &&
    currentAuth.error === null &&
    !currentAuth.isFetching;

  useEffect(() => {
    if (verifiedExistingSession) {
      router.replace(returnTarget);
    }
  }, [returnTarget, router, verifiedExistingSession]);

  useEffect(() => {
    if (signInError !== null) errorAlertRef.current?.focus();
  }, [signInError]);

  useEffect(() => {
    if (!currentAuth.isPending && !verifiedExistingSession) {
      setFocus("email");
    }
  }, [currentAuth.isPending, setFocus, verifiedExistingSession]);

  if (currentAuth.isPending || verifiedExistingSession) {
    return <SessionCheck />;
  }

  const sessionEnded = isEndedSessionError(currentAuth.error);
  const sessionExpired =
    searchParams.get("reason") === "session-expired" ||
    isExpiredSessionError(currentAuth.error);
  const signedOut = searchParams.get("reason") === "signed-out";
  const sessionCheckFailed =
    currentAuth.error !== null && !sessionEnded && !sessionExpired;
  const emailErrorId = errors.email === undefined ? undefined : "email-error";
  const passwordErrorId =
    errors.password === undefined ? undefined : "password-error";
  const submit = async (values: LoginInput): Promise<void> => {
    const parsed = loginInputSchema.safeParse(values);
    if (!parsed.success || isSigningIn) return;

    setSignInError(null);
    setIsSigningIn(true);
    // React Hook Form otherwise retains the submitted password in component
    // state. The request owns the short-lived parsed value until it settles.
    resetField("password", { defaultValue: "" });

    try {
      await signInAndCacheCurrentAuth(queryClient, parsed.data, login);
      router.replace(returnTarget);
    } catch (error) {
      setSignInError(toApiError(error));
      setIsSigningIn(false);
    }
  };

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-accent">
          Secure access
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Sign in to MobileShop OS
        </h1>
        <p className="mt-2 text-[0.8125rem] text-ink-muted">
          Use the account issued by the shop owner or administrator.
        </p>
      </div>

      {sessionExpired ? (
        <div
          className="mt-5 flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-[0.8125rem] text-warning"
          role="status"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Your previous session ended. Sign in again to continue securely.
          </p>
        </div>
      ) : null}

      {signedOut ? (
        <div
          className="mt-5 flex items-start gap-2.5 rounded-control border border-positive/25 bg-positive-soft p-3 text-[0.8125rem] text-positive"
          role="status"
        >
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>Your server session was revoked. You are now signed out.</p>
        </div>
      ) : null}

      {sessionCheckFailed ? (
        <div
          className="mt-5 flex items-start gap-2.5 rounded-control border border-info/25 bg-info-soft p-3 text-[0.8125rem] text-info"
          role="status"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            An existing session could not be checked. You can still submit your
            credentials when the API is available.
          </p>
        </div>
      ) : null}

      {signInError === null ? null : (
        <div
          aria-live="assertive"
          className="mt-5 rounded-control border border-negative/25 bg-negative-soft p-3 text-[0.8125rem] text-negative"
          ref={errorAlertRef}
          role="alert"
          tabIndex={-1}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Sign-in failed</p>
              <p className="mt-0.5">{loginErrorMessage(signInError)}</p>
              {signInError.requestId === undefined ? null : (
                <p className="mt-2 text-xs">
                  Request reference:{" "}
                  <code className="font-mono">{signInError.requestId}</code>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        aria-busy={isSigningIn}
        className="mt-6 space-y-4"
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => submit(values))(event);
        }}
      >
        <div>
          <label
            className="mb-1.5 block text-[0.8125rem] font-semibold text-ink-subtle"
            htmlFor="email"
          >
            Email address
          </label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              aria-describedby={emailErrorId}
              aria-invalid={errors.email !== undefined}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className="min-h-11 w-full rounded-control border border-line bg-surface-subtle py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-wait disabled:opacity-65"
              disabled={isSigningIn}
              id="email"
              inputMode="email"
              placeholder="name@example.com"
              spellCheck={false}
              type="email"
              {...register("email", { validate: validateEmail })}
            />
          </div>
          {errors.email?.message === undefined ? null : (
            <p className="mt-1.5 text-xs text-negative" id="email-error">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            className="mb-1.5 block text-[0.8125rem] font-semibold text-ink-subtle"
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative">
            <LockIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              aria-describedby={passwordErrorId}
              aria-invalid={errors.password !== undefined}
              autoComplete="current-password"
              className="min-h-11 w-full rounded-control border border-line bg-surface-subtle py-2.5 pl-10 pr-11 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-wait disabled:opacity-65"
              disabled={isSigningIn}
              id="password"
              placeholder="Enter your password"
              type={showPassword ? "text" : "password"}
              {...register("password", { validate: validatePassword })}
            />
            <button
              aria-controls="password"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-control text-ink-muted hover:bg-line-subtle hover:text-ink disabled:cursor-wait disabled:opacity-60"
              disabled={isSigningIn}
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
          {errors.password?.message === undefined ? null : (
            <p className="mt-1.5 text-xs text-negative" id="password-error">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-strong disabled:cursor-wait disabled:opacity-65"
          disabled={isSigningIn}
          type="submit"
        >
          {isSigningIn ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              Signing in…
            </>
          ) : (
            <>
              <LogInIcon className="size-4" /> Sign in securely
            </>
          )}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-control bg-surface-subtle p-3 text-xs text-ink-muted">
        <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-positive" />
        <p>
          Identity, active session, and branch eligibility are checked by the
          server. Permissions will gate operational routes as those routes are
          implemented.
        </p>
      </div>
    </div>
  );
}
