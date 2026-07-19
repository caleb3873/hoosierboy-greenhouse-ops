// Unit tests: CSV parser + merge fields (run: node scripts/test_email_utils.mjs)
import { parseMailchimpCsv, fillMerge, mergeFieldsIn, easyBody } from "../src/emailKit.js";
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("FAIL:", name); } };

const mc = parseMailchimpCsv('Email Address,First Name,Last Name\n"a@b.com","Jo","Smith"\nbad-email,X,Y\nA@B.COM,dup,e\nc@d.org,"Q, Jr",Z\n');
ok(mc.contacts.length === 2, "csv: 2 valid deduped");
ok(mc.contacts[0].email === "a@b.com" && mc.contacts[0].name === "Jo Smith", "csv: name join");
ok(mc.contacts[1].name === "Q, Jr Z", "csv: quoted comma field");
ok(mc.skippedInvalid === 1, "csv: invalid counted");
const headerless = parseMailchimpCsv("x@y.com\nz@w.com\n");
ok(headerless.contacts.length === 2, "csv: headerless email list");

ok(fillMerge("Hi {first_name} of {organization}", { first_name: "Jo", organization: "Acme" }) === "Hi Jo of Acme", "merge: fills");
ok(fillMerge("Hi {first_name}", {}) === "Hi there", "merge: first_name fallback 'there'");
ok(fillMerge("From {organization}", {}) === "From ", "merge: unknown org empty");
ok(JSON.stringify(mergeFieldsIn("a {first_name} b {organization} c {nope}")) === JSON.stringify(["first_name","organization"]), "merge: detect only known");

const body = easyBody({ headline: "Hello", message: "Para one\n\nPara two line1\nline2" });
ok(body.includes("Hello") && (body.match(/<p /g) || []).length >= 2 && body.includes("line1<br/>line2"), "easyBody: paragraphs + br");
ok(body.includes("{UNSUB}"), "easyBody: unsub slot present");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
