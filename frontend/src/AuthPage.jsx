import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useToast } from "./Toast";

const apiUrl = import.meta.env.VITE_API_URL || "";

export default function AuthPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const requestedNext = new URLSearchParams(window.location.search).get("next") || "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  useEffect(() => {
    if (!googleClientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);
    script.onload = () => {
      if (!window.google?.accounts?.id) {
        setError("Google Sign-In could not be initialized. Please refresh and try again."); toast("Google Sign-In could not be initialized.", "error");
        return;
      }
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: async ({ credential }) => {
        const response = await fetch(`${apiUrl}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
        const data = await response.json();
        if (!response.ok) { setError(data.error); toast(data.error || "Google sign-in failed.", "error"); return; }
        localStorage.setItem("verdant_token", data.token);
        window.location.href = next;
      } });
      const button = document.getElementById("google-sign-in");
      if (button) window.google.accounts.id.renderButton(button, { theme: "outline", size: "large", width: 330 });
    };
    script.onerror = () => { setError("Google Sign-In could not be loaded. Check your internet connection and try again."); toast("Google Sign-In could not be loaded.", "error"); };
    return () => script.remove();
  }, [googleClientId, next]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const endpoint = otpSent ? "verify" : "request-otp";
    const body = otpSent ? { email, otp } : { email, ...(register ? { register: true, name, mobile } : {}) };
    try {
      const response = await fetch(`${apiUrl}/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error); toast(data.error || "Unable to send verification code.", "error");
        return;
      }
      if (!otpSent) {
        setOtpSent(true);
        toast("Verification code sent to your email.");
        return;
      }
      localStorage.setItem("verdant_token", data.token);
      toast("Email verified. You are signed in.");
      window.location.href = next;
    } catch {
      setError("Unable to contact the server. Please try again."); toast("Unable to contact the server.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return <><Navbar /><main className="auth-page"><div className="auth-card"><p className="eyebrow">{register ? "JOIN VERDANT" : "WELCOME BACK"}</p><h1>{register ? "Create your account." : "Sign in."}</h1><p className="auth-subtitle">{otpSent ? `Enter the verification code sent to ${email}.` : register ? "Create your account with your email, name, and mobile number." : "Sign in with your email verification code."}</p><form onSubmit={submit}>{!otpSent ? <><input required disabled={submitting} type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} />{register && <><input required disabled={submitting} maxLength="100" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} /><input required disabled={submitting} type="tel" placeholder="Mobile number" value={mobile} onChange={(event) => setMobile(event.target.value)} /></>}</> : <input required disabled={submitting} inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit verification code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} />}<button className="button" disabled={submitting} type="submit">{submitting ? "Please wait..." : otpSent ? "Verify email" : register ? "Send verification code" : "Send verification code"} <span>→</span></button></form>{otpSent && <button className="auth-switch" disabled={submitting} onClick={() => { setOtpSent(false); setOtp(""); setError(""); }}>Use a different email</button>}{!register && !otpSent && <>{googleClientId ? <div id="google-sign-in" className="google-sign-in" /> : <p className="auth-hint">Google Sign-In is not configured.</p>}</>}{error && <p className="auth-error" role="alert">{error}</p>}{!otpSent && <button className="auth-switch" disabled={submitting} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button>}</div></main></>;
}
