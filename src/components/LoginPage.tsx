import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface LoginPageProps {
  onSuccess: (email: string) => void;
}

const REMEMBER_KEY = 'associate.rememberEmail';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.12 + i * 0.08,
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

type AuthMode = 'login' | 'forgot' | 'reset' | 'bootstrap';

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/setup-status', {
          credentials: 'include',
        });
        const data = (await res.json().catch(() => ({}))) as {
          bootstrapRequired?: boolean;
        };
        if (!cancelled && data.bootstrapRequired) {
          setBootstrapRequired(true);
          setMode('bootstrap');
        }
      } catch {
        // ignore — login form still usable if status fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: AuthMode) => {
    if (bootstrapRequired && next !== 'bootstrap') return;
    setMode(next);
    setError(null);
    setSuccess(null);
    setPassword('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        // ignore
      }

      onSuccess(data.email || email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to start password reset.');
      }
      setSuccess(
        data.message ||
          'If an account exists for that email, a reset token was issued.'
      );
      setMode('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          token: resetToken.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }
      setSuccess(data.message || 'Password updated. Please sign in.');
      setPassword('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          confirmPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to complete setup.');
      }
      setBootstrapRequired(false);
      setPassword('');
      setConfirmPassword('');
      setSuccess(data.message || 'Administrator created. Please sign in.');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit =
    mode === 'login'
      ? handleLogin
      : mode === 'forgot'
        ? handleForgot
        : mode === 'bootstrap'
          ? handleBootstrap
          : handleReset;

  return (
    <div className="login-screen relative min-h-dvh w-full overflow-hidden bg-[var(--navy-900)] text-white">
      {/* Full-bleed animated backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grad-navy" />
        <div className="login-mesh absolute inset-0 opacity-40" />
        <motion.div
          className="absolute -left-[18%] -top-[20%] h-[55vmax] w-[55vmax] rounded-full bg-[var(--gold)]/20 blur-3xl"
          animate={{ x: [0, 40, -20, 0], y: [0, 30, -10, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-[10%] top-[10%] h-[42vmax] w-[42vmax] rounded-full bg-[var(--ice)]/25 blur-3xl"
          animate={{ x: [0, -50, 20, 0], y: [0, 40, -25, 0], scale: [1, 0.92, 1.06, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[-20%] left-[25%] h-[48vmax] w-[48vmax] rounded-full bg-[var(--navy-700)]/50 blur-3xl"
          animate={{ x: [0, 30, -40, 0], y: [0, -35, 15, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-[12%] top-[22%] h-40 w-40 rounded-full border border-white/15"
          animate={{ y: [0, -18, 0], rotate: [0, 12, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-[18%] bottom-[18%] h-28 w-28 rounded-full border border-[var(--gold)]/35"
          animate={{ y: [0, 22, 0], rotate: [0, -16, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-[8%] top-[42%] h-3 w-3 rounded-full bg-[var(--gold)]"
          animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.4, 1] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
        <motion.div
          className="absolute left-[40%] top-[16%] h-2 w-2 rounded-full bg-white"
          animate={{ opacity: [0.2, 0.9, 0.2], y: [0, -10, 0] }}
          transition={{ duration: 3.2, repeat: Infinity }}
        />
      </div>

      <div className="relative z-10 grid min-h-dvh lg:grid-cols-2">
        {/* Left — brand hero (full height) */}
        <section className="relative flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/25 shadow-card bg-[var(--navy-700)]"
              whileHover={{ scale: 1.06, rotate: -3 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              <img
                src="/srsb-logo.jpg"
                alt="SRSB"
                className="h-full w-full object-cover"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent to-[var(--gold)]/25" />
            </motion.div>
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
                SRSB
              </p>
              <p className="text-sm text-white/75">Associate Ledger</p>
            </div>
          </motion.div>

          <div className="my-10 max-w-xl lg:my-0">
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gold)] backdrop-blur-md"
            >
              <Sparkles className="h-3.5 w-3.5" />
              IT · GST · Live
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="font-display text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
            >
              Welcome
              <span className="block bg-gradient-to-r from-white via-white to-[var(--gold)] bg-clip-text text-transparent">
                back.
              </span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-4 font-display text-xl font-bold uppercase tracking-[0.18em] text-white/90 sm:text-2xl"
            >
              Associate
            </motion.p>

            <motion.p
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-md text-base leading-relaxed text-white/70"
            >
              Manage Income Tax &amp; GST filings, client money, summaries, and
              Excel import / export — all in one clean workspace.
            </motion.p>

            <motion.div
              custom={4}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-8 flex flex-wrap gap-2"
            >
              {['Fees tracked', 'Excel ready', 'Fast search'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </motion.div>

            <motion.div
              className="mt-8 h-1.5 w-20 origin-left rounded-full bg-[var(--gold)]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          <motion.p
            className="hidden text-xs text-white/45 lg:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            SRSB Associate · Authorized access only
          </motion.p>
        </section>

        {/* Right — full-height form panel */}
        <section className="relative flex items-end justify-center px-4 pb-6 pt-2 sm:px-8 sm:pb-10 lg:items-center lg:px-10 lg:py-12 xl:px-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent lg:bg-gradient-to-l lg:from-black/20 lg:via-transparent" />

          <motion.form
            key={mode}
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 48, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[540px] lg:max-w-[580px] rounded-[32px] border border-white/70 bg-white px-7 py-10 shadow-[0_30px_80px_rgba(20,30,80,0.35)] sm:px-10 sm:py-12 lg:min-h-[560px] lg:flex lg:flex-col lg:justify-center"
          >
            <div className="mb-8">
              <h2 className="font-display text-4xl sm:text-[2.75rem] font-extrabold tracking-tight text-[var(--ink)]">
                {mode === 'login'
                  ? 'Sign in'
                  : mode === 'forgot'
                    ? 'Forgot password'
                    : mode === 'bootstrap'
                      ? 'First-time setup'
                      : 'Reset password'}
              </h2>
              <p className="mt-3 text-base text-[var(--muted)]">
                {mode === 'login'
                  ? 'Drop your email + password. Let’s go.'
                  : mode === 'forgot'
                    ? 'Enter your email. A reset token will be written to a local file on this machine (not emailed).'
                    : mode === 'bootstrap'
                      ? 'Create the administrator account. Use a strong password (12+ chars, upper, lower, number, special).'
                      : 'Paste the reset token from data/PASSWORD_RESET_TOKEN.txt, then set a new strong password.'}
              </p>
            </div>

            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-base font-medium text-[var(--muted)]">
                  User Name
                </span>
                <motion.div
                  animate={{
                    boxShadow:
                      focused === 'email'
                        ? '0 0 0 4px color-mix(in srgb, var(--blue-500) 22%, transparent)'
                        : '0 0 0 0 transparent',
                  }}
                  className="rounded-2xl"
                >
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused(null)}
                    placeholder="admin@srsbassociate.com"
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                  />
                </motion.div>
              </label>

              {(mode === 'login' || mode === 'bootstrap') && (
                <label className="block space-y-2">
                  <span className="text-base font-medium text-[var(--muted)]">
                    Password
                  </span>
                  <motion.div
                    animate={{
                      boxShadow:
                        focused === 'password'
                          ? '0 0 0 4px color-mix(in srgb, var(--blue-500) 22%, transparent)'
                          : '0 0 0 0 transparent',
                    }}
                    className="relative rounded-2xl"
                  >
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={
                        mode === 'bootstrap' ? 'new-password' : 'current-password'
                      }
                      required
                      minLength={mode === 'bootstrap' ? 12 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocused('password')}
                      onBlur={() => setFocused(null)}
                      placeholder={
                        mode === 'bootstrap'
                          ? '12+ chars, upper, lower, number, special'
                          : 'Enter password'
                      }
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 pr-16 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold uppercase tracking-wider text-[var(--navy-900)] transition-colors hover:text-[var(--gold)] cursor-pointer"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </motion.div>
                </label>
              )}

              {mode === 'bootstrap' && (
                <label className="block space-y-2">
                  <span className="text-base font-medium text-[var(--muted)]">
                    Confirm password
                  </span>
                  <input
                    id="bootstrap-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                  />
                </label>
              )}

              {mode === 'reset' && (
                <>
                  <label className="block space-y-2">
                    <span className="text-base font-medium text-[var(--muted)]">
                      Reset token
                    </span>
                    <input
                      id="reset-token"
                      type="text"
                      autoComplete="one-time-code"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      onFocus={() => setFocused('token')}
                      onBlur={() => setFocused(null)}
                      placeholder="Paste token from data/PASSWORD_RESET_TOKEN.txt"
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 font-mono text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-base font-medium text-[var(--muted)]">
                      New password
                    </span>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={12}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="12+ chars, upper, lower, number, special"
                        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 pr-16 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold uppercase tracking-wider text-[var(--navy-900)] transition-colors hover:text-[var(--gold)] cursor-pointer"
                      >
                        {showNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-base font-medium text-[var(--muted)]">
                      Confirm new password
                    </span>
                    <input
                      id="confirm-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--frost-100)] px-4 py-4 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)]/70 focus:border-[var(--blue-500)] focus:bg-white"
                    />
                  </label>
                </>
              )}
            </div>

            {mode === 'login' ? (
              <div className="mt-5 flex items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-base text-[var(--ink)]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-5 w-5 cursor-pointer accent-[var(--navy-900)]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-sm font-semibold text-[var(--navy-900)] hover:text-[var(--navy-700)] cursor-pointer underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            ) : mode === 'bootstrap' ? (
              <p className="mt-5 text-sm text-[var(--muted)]">
                This one-time setup creates the only administrator for this
                installation.
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-sm font-semibold text-[var(--navy-900)] hover:text-[var(--navy-700)] cursor-pointer underline-offset-2 hover:underline"
                >
                  ← Back to sign in
                </button>
                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-sm font-semibold text-[var(--navy-900)] hover:text-[var(--navy-700)] cursor-pointer underline-offset-2 hover:underline"
                  >
                    I already have a token →
                  </button>
                )}
                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-sm font-semibold text-[var(--navy-900)] hover:text-[var(--navy-700)] cursor-pointer underline-offset-2 hover:underline"
                  >
                    Request a new token
                  </button>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key={error}
                  role="alert"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-5 overflow-hidden rounded-2xl border border-red-200 bg-[var(--danger-15)] px-3 py-2.5 text-sm text-red-700"
                >
                  {error}
                </motion.div>
              )}
              {success && (
                <motion.div
                  key={success}
                  role="status"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-[var(--success-15)] px-3 py-2.5 text-sm text-emerald-800"
                >
                  {success}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: submitting ? 1 : 1.02, y: submitting ? 0 : -1 }}
              whileTap={{ scale: submitting ? 1 : 0.98 }}
              className="relative mt-8 w-full min-h-[60px] overflow-hidden rounded-2xl bg-grad-navy px-4 py-5 text-lg font-extrabold tracking-wide text-white shadow-card cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <motion.span
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                animate={{ x: ['-120%', '120%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 1.2 }}
              />
              <span className="relative">
                {mode === 'login'
                  ? submitting
                    ? 'Locking you in…'
                    : 'Sign in →'
                  : mode === 'forgot'
                    ? submitting
                      ? 'Sending…'
                      : 'Send reset token →'
                    : mode === 'bootstrap'
                      ? submitting
                        ? 'Creating admin…'
                        : 'Create administrator →'
                      : submitting
                        ? 'Updating…'
                        : 'Update password →'}
              </span>
            </motion.button>

            <p className="mt-6 text-center text-sm text-[var(--muted)]">
              SRSB Associate · IT &amp; GST Filing Ledger
            </p>
          </motion.form>
        </section>
      </div>
    </div>
  );
}
