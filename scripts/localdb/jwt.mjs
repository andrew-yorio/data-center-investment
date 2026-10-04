// Prints an HS256 JWT for the given role. Local testing only.
import { createHmac } from "node:crypto";
const [secret, role] = process.argv.slice(2);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role, iss: "local", exp: Math.floor(Date.now() / 1000) + 86400 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
