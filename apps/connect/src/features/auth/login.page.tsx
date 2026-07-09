import { useMutation } from "@tanstack/react-query";
import { LogIn, ShieldCheck } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../shared/ui/button";
import { PasswordField, TextField } from "../../shared/ui/fields";
import { InlineNotice } from "../../shared/ui/inline-notice";
import { Panel } from "../../shared/ui/panel";
import { signInWithPassword } from "./auth.service";
import { useAuthStore } from "./auth.store";

function submitForm(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function LoginPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const authError = useAuthStore((state) => state.error);
  const login = useMutation({
    mutationFn: signInWithPassword,
  });

  useLayoutEffect(() => {
    emailInputRef.current?.focus();
  }, []);
  const visibleError = login.error?.message ?? authError;

  function resetLoginError(): void {
    if (login.error) login.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (login.isPending) return;
    login.mutate({ email, password });
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || login.isPending) return;
    const form = event.currentTarget.form ?? formRef.current;
    if (!form) return;
    event.preventDefault();
    submitForm(form);
  }

  return (
    <main className="connect-canvas min-h-svh p-4 text-default md:p-8">
      <div className="mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-5xl items-center md:min-h-[calc(100svh-4rem)] md:grid-cols-[1fr_0.9fr] md:gap-10">
        <section className="hidden md:block">
          <p className="text-xs font-semibold uppercase tracking-normal text-tertiary">Connect</p>
          <h1 className="mt-4 max-w-2xl heading-2xl text-default">
            Keep your assistant connected and ready.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-secondary">
            Review requests and manage the accounts your assistant can use.
          </p>
        </section>

        <Panel className="p-5 shadow-sm md:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary-solid text-primary-solid">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-tertiary">
                Connect login
              </p>
              <h1 className="heading-md">Connect</h1>
            </div>
          </div>

          <form ref={formRef} className="grid gap-4" onSubmit={submit} aria-busy={login.isPending}>
            <TextField
              ref={emailInputRef}
              label="Email"
              value={email}
              onBlur={() => setEmail((value) => value.trim())}
              onChange={(event) => {
                resetLoginError();
                setEmail(event.target.value);
              }}
              onKeyDown={submitOnEnter}
              type="email"
              placeholder="connect@example.com"
              autoComplete="email"
              autoCapitalize="none"
              enterKeyHint="go"
              inputMode="email"
              spellCheck={false}
              required
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(event) => {
                resetLoginError();
                setPassword(event.target.value);
              }}
              onKeyDown={submitOnEnter}
              enterKeyHint="go"
              required
            />
            <Button
              block
              disabled={login.isPending}
              loading={login.isPending}
              type="submit"
              aria-label={login.isPending ? "Signing in" : "Sign in"}
            >
              <LogIn className="size-4" />
              {login.isPending ? "Signing in" : "Sign in"}
            </Button>
          </form>

          {visibleError ? (
            <div className="mt-4" role="alert">
              <InlineNotice tone="error">{visibleError}</InlineNotice>
            </div>
          ) : null}
        </Panel>
      </div>
    </main>
  );
}
