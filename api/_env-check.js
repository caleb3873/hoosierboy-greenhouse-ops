// Temporary diagnostic — returns which env vars are present (true/false only,
// no values). Delete this file once we've confirmed the env config.
module.exports = async (req, res) => {
  const KEYS = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "REACT_APP_SUPABASE_URL",
    "SUPABASE_URL",
    "ANTHROPIC_API_KEY",
    "REACT_APP_ANTHROPIC_API_KEY",
    "RESEND_API_KEY",
  ];
  const result = {};
  for (const k of KEYS) {
    const v = process.env[k];
    result[k] = v
      ? { present: true, length: v.length, prefix: v.slice(0, 6) + "…" }
      : { present: false };
  }
  res.status(200).json(result);
};
