'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import type { User } from '@supabase/supabase-js';
import {
  CheckCircle2,
  Clock3,
  KeyRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadAccessState, type AccessState } from '@/lib/supabase-data';
import { makeSupabaseClient, type SupabaseConfig } from '@/lib/supabase-client';

type Screen = 'auth' | 'password' | 'submitted' | 'access';

export default function LoginPageClient({
  supabaseConfig,
}: {
  supabaseConfig?: SupabaseConfig;
}) {
  const client = useMemo(
    () => (supabaseConfig ? makeSupabaseClient(supabaseConfig) : null),
    [supabaseConfig],
  );
  const [screen, setScreen] = useState<Screen>('auth');
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessState>();
  const [ready, setReady] = useState(!supabaseConfig);
  const [message, setMessage] = useState('');

  const resolveSignedInUser = useCallback(
    async (nextUser: User) => {
      if (!client) return;
      setUser(nextUser);
      const action = authActionFromLocation();
      if (action === 'invite' || action === 'recovery') {
        setScreen('password');
        return;
      }
      const nextAccess = await loadAccessState(client, nextUser);
      setAccess(nextAccess);
      if (nextAccess.isActive && nextAccess.status === 'active') {
        window.location.replace('/');
        return;
      }
      setScreen('access');
    },
    [client],
  );

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    void client.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!mounted) return;
        if (error || !data.user) {
          setReady(true);
          return;
        }
        await resolveSignedInUser(data.user);
        if (mounted) setReady(true);
      })
      .catch((error: Error) => {
        if (mounted) {
          setMessage(error.message);
          setReady(true);
        }
      });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAccess(undefined);
        setScreen('auth');
        return;
      }
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setUser(session.user);
        setScreen('password');
        return;
      }
      if (session?.user) void resolveSignedInUser(session.user);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [client, resolveSignedInUser]);

  if (!ready)
    return (
      <AuthShell>
        <p className="text-center text-sm text-muted-foreground">
          Checking your secure session…
        </p>
      </AuthShell>
    );

  if (!client)
    return (
      <AuthShell>
        <Alert variant="destructive">
          <AlertTitle>Authentication is not configured</AlertTitle>
          <AlertDescription>
            The Supabase URL and publishable key are missing from this
            deployment.
          </AlertDescription>
        </Alert>
      </AuthShell>
    );

  if (screen === 'password' && user)
    return (
      <PasswordForm
        email={user.email ?? ''}
        message={message}
        setMessage={setMessage}
        onSave={async (password) => {
          const { error } = await client.auth.updateUser({ password });
          if (error) throw error;
          const nextAccess = await loadAccessState(client, user);
          setAccess(nextAccess);
          clearAuthAction();
          if (nextAccess.isActive && nextAccess.status === 'active')
            window.location.replace('/');
          else setScreen('access');
        }}
        onSignOut={() => void client.auth.signOut()}
      />
    );

  if (screen === 'submitted')
    return (
      <AuthShell>
        <Card className="bg-card shadow-xl">
          <CardHeader>
            <CheckCircle2 className="mb-2 size-8 text-[var(--success-foreground)]" />
            <CardTitle className="font-display text-2xl">
              Request received
            </CardTitle>
            <CardDescription>
              Confirm your email if a confirmation message arrives. Your account
              will stay locked until an authorised person approves it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setScreen('auth')}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );

  if (screen === 'access' && access)
    return (
      <AccessStatusCard
        access={access}
        onSignOut={() => void client.auth.signOut()}
      />
    );

  return (
    <AuthShell>
      <Card className="bg-card p-2 shadow-xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Content Operations
          </CardTitle>
          <CardDescription>
            Use your own work email and password. A ChatGPT account is not
            required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="request">Request access</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm
                message={message}
                setMessage={setMessage}
                onSignIn={async (email, password) => {
                  const { data, error } = await client.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                  if (data.user) await resolveSignedInUser(data.user);
                }}
                onReset={async (email) => {
                  const redirectTo = `${window.location.origin}/login?auth_action=recovery`;
                  const { error } = await client.auth.resetPasswordForEmail(
                    email,
                    { redirectTo },
                  );
                  if (error) throw error;
                }}
              />
            </TabsContent>
            <TabsContent value="request">
              <RegistrationForm
                message={message}
                setMessage={setMessage}
                onRegister={async (fullName, email, password) => {
                  const { error } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                      data: { full_name: fullName },
                      emailRedirectTo: `${window.location.origin}/login?auth_action=confirm`,
                    },
                  });
                  if (error) throw error;
                  setScreen('submitted');
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Approval-controlled access · Asia/Kolkata
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <Image
          src="/aafm-india-logo.png"
          alt="AAFM India — American Academy of Financial Management"
          width={1684}
          height={594}
          priority
          className="mx-auto mb-7 h-auto w-full max-w-[360px]"
        />
        {children}
      </div>
    </div>
  );
}

function SignInForm({
  message,
  setMessage,
  onSignIn,
  onReset,
}: {
  message: string;
  setMessage: (value: string) => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onReset: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await onSignIn(email.trim().toLowerCase(), password);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Sign-in could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setMessage('Enter your email first.');
      return;
    }
    setBusy(true);
    try {
      await onReset(email.trim().toLowerCase());
      setMessage('Password reset link sent. Check your email.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The reset email could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="login-email" className="mb-1.5">
          Email
        </Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="login-password" className="mb-1.5">
          Password
        </Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <StatusMessage message={message} />
      <Button type="submit" className="w-full" disabled={busy}>
        <KeyRound /> {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={() => void reset()}
      >
        Forgot password?
      </Button>
    </form>
  );
}

function RegistrationForm({
  message,
  setMessage,
  onRegister,
}: {
  message: string;
  setMessage: (value: string) => void;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    if (password.length < 10) {
      setMessage('Use at least 10 characters for your password.');
      return;
    }
    if (password !== confirm) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await onRegister(name.trim(), email.trim().toLowerCase(), password);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Registration could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert className="bg-muted/45">
        <ShieldCheck />
        <AlertTitle>Approval is required</AlertTitle>
        <AlertDescription>
          Register with your real name and work email. Your saved team role is
          activated only after an authorised person approves you.
        </AlertDescription>
      </Alert>
      <div>
        <Label htmlFor="request-name" className="mb-1.5">
          Full name
        </Label>
        <Input
          id="request-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example, Priya"
          required
        />
      </div>
      <div>
        <Label htmlFor="request-email" className="mb-1.5">
          Work email
        </Label>
        <Input
          id="request-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="request-password" className="mb-1.5">
          Create password
        </Label>
        <Input
          id="request-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="request-confirm" className="mb-1.5">
          Confirm password
        </Label>
        <Input
          id="request-confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      <StatusMessage message={message} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Sending request…' : 'Request access'}
      </Button>
    </form>
  );
}

function PasswordForm({
  email,
  message,
  setMessage,
  onSave,
  onSignOut,
}: {
  email: string;
  message: string;
  setMessage: (value: string) => void;
  onSave: (password: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    if (password.length < 10) return setMessage('Use at least 10 characters.');
    if (password !== confirm) return setMessage('The passwords do not match.');
    setBusy(true);
    try {
      await onSave(password);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Password could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell>
      <Card className="bg-card shadow-xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Create your password
          </CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Input
              aria-label="Confirm password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              placeholder="Confirm password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
            <StatusMessage message={message} />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onSignOut}
            >
              Cancel and sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function AccessStatusCard({
  access,
  onSignOut,
}: {
  access: AccessState;
  onSignOut: () => void;
}) {
  const rejected = access.status === 'rejected';
  const paused = access.status === 'paused';
  return (
    <AuthShell>
      <Card className="bg-card shadow-xl">
        <CardHeader>
          <Clock3 className="mb-2 size-8 text-[#dfa126]" />
          <CardTitle className="font-display text-2xl">
            {rejected
              ? 'Access was not approved'
              : paused
                ? 'Access is paused'
                : 'Approval pending'}
          </CardTitle>
          <CardDescription>
            {access.fullName} · {access.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rejected
              ? 'Contact Aditi if you believe this should be reviewed again.'
              : paused
                ? 'An Owner has paused this account. Contact Aditi if you need access restored.'
                : 'Your login is secure, but the tracker stays locked until your pre-set team responsibilities are approved. Priya’s Admin access must be approved once by Aditi.'}
          </p>
          <Button variant="outline" className="w-full" onClick={onSignOut}>
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function StatusMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <output
      aria-live="polite"
      className="block text-sm text-[var(--danger-foreground)]"
    >
      {message}
    </output>
  );
}

function authActionFromLocation() {
  if (typeof window === 'undefined') return '';
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    search.get('auth_action') ?? search.get('type') ?? hash.get('type') ?? ''
  );
}

function clearAuthAction() {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_action');
  url.searchParams.delete('type');
  url.hash = '';
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}
