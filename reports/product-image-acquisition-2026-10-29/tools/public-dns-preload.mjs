// Environment shim for THIS machine only: its DNS fails SRV and some A lookups. Routes Node's lookups through public
// resolvers (1.1.1.1 / 8.8.8.8). Loaded with --import for read-only rehearsal runs; it does not change any project code.
import dns from "node:dns";
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const original = dns.lookup;
dns.lookup = function (host, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  if (typeof opts === "number") opts = { family: opts };
  dns.promises.resolve4(host).then(
    (a) => (opts?.all ? cb(null, a.map((address) => ({ address, family: 4 }))) : cb(null, a[0], 4)),
    () => original.call(dns, host, opts, cb),
  );
};
