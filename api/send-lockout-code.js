// api/send-lockout-code.js
// Generates a 6-digit access code for sales season lockout and emails it to Caleb

const RESEND_KEY = process.env.RESEND_API_KEY;
const RECIPIENT = "caleb@schlegelgreenhouse.com";
const FROM = "onboarding@resend.dev";

// Generate a random 6-digit code
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Simple in-memory store (resets on cold start, but that's fine — codes are short-lived)
let currentCode = null;
let codeExpiry = null;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { action } = req.body || {};

    // ── Generate + send code ──────────────────────────────────────────────
    if (action === "generate") {
      const code = generateCode();
      currentCode = code;
      codeExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: RECIPIENT,
            subject: `Greenhouse Ops — Sales Season Access Code`,
            html: `
              <div style="font-family: sans-serif; max-width: 500px;">
                <h2 style="color: #1e2d1a;">Sales Season Access Code</h2>
                <p>Someone has requested access to crop planning during sales season lockout.</p>
                <div style="background: #f0f8eb; border: 2px solid #7fb069; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
                  <div style="font-size: 36px; font-weight: 800; color: #1e2d1a; letter-spacing: 6px;">${code}</div>
                </div>
                <p style="color: #7a8c74; font-size: 13px;">This code expires in 24 hours. Only share it with team members who need planning access.</p>
                <p style="color: #aabba0; font-size: 11px;">— Hoosier Boy Greenhouse Ops</p>
              </div>
            `,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json();
          return res.status(500).json({ error: err.message || "Email send failed" });
        }

        return res.status(200).json({ sent: true, message: "Code sent to Caleb" });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ── Verify code ───────────────────────────────────────────────────────
    if (action === "verify") {
      const { code } = req.body || {};
      if (!currentCode || !codeExpiry) {
        return res.status(400).json({ valid: false, message: "No code has been generated" });
      }
      if (Date.now() > codeExpiry) {
        currentCode = null;
        codeExpiry = null;
        return res.status(400).json({ valid: false, message: "Code has expired" });
      }
      if (code === currentCode) {
        return res.status(200).json({ valid: true });
      }
      return res.status(400).json({ valid: false, message: "Invalid code" });
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
